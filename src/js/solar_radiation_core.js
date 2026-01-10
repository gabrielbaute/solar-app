/**
 * @fileoverview Módulo central para la obtención de datos de radiación solar (G_i) y la optimización del ángulo de inclinación (beta).
 * Contiene la lógica necesaria para los cálculos astronómicos, la llamada a la API y la generación del HSP mensual.
 * Este módulo es totalmente reutilizable para sistemas autónomos y conectados a la red.
 */

// === Importaciones de Módulos Necesarios ===
import { 
    RAD_A_DEG, calcularRadiacionInclinada, obtenerPaisPorCoordenadas, 
    obtenerGdOpenMeteo, calcularDelta, calcularG0d, 
    calcularComponentesHorizontales
} from './solar_formulas.js'; // Asumimos que todas estas funciones están disponibles

// === Datos Globales ===
const mesesData = [
    { nombre: "Enero", dias: 31, inicio_dn: 1 },
    { nombre: "Febrero", dias: 28, inicio_dn: 32 },
    { nombre: "Marzo", dias: 31, inicio_dn: 60 },
    { nombre: "Abril", dias: 30, inicio_dn: 91 },
    { nombre: "Mayo", dias: 31, inicio_dn: 121 },
    { nombre: "Junio", dias: 30, inicio_dn: 152 },
    { nombre: "Julio", dias: 31, inicio_dn: 182 },
    { nombre: "Agosto", dias: 31, inicio_dn: 213 },
    { nombre: "Septiembre", dias: 30, inicio_dn: 244 },
    { nombre: "Octubre", dias: 31, inicio_dn: 274 },
    { nombre: "Noviembre", dias: 30, inicio_dn: 305 },
    { nombre: "Diciembre", dias: 31, inicio_dn: 335 }
];

/**
 *  FUNCIÓN CENTRAL DE EXTRACCIÓN Y CÁLCULO
 *
 * Obtiene los datos de irradiancia horizontal (Gd) para 12 meses, calcula los componentes y 
 * encuentra el ángulo de inclinación óptimo (beta) para maximizar la producción anual.
 *
 * @param {number} latitudGrados Latitud del sitio (en grados).
 * @param {number} longitudGrados Longitud del sitio (en grados).
 * @param {number} diaDelMes Día del mes a usar como representativo (ej. 15).
 * @returns {Promise<{
 * anguloOptimo: number|null, 
 * GiMinMensual: number, 
 * GiAnualMWh: number, 
 * resultadosMensuales: Array<Object>
 * }>} Objeto con el ángulo óptimo y la Gi mínima y anual.
 */
export async function calcularRadiacionOptima(latitudGrados, longitudGrados, diaDelMes = 15) {

    const latitudRadianes = latitudGrados / RAD_A_DEG;

    // --- 1. Obtener datos astronómicos y llamar a la API para Gd ---
    const preApiPromises = [];
    for (let i = 0; i < mesesData.length; i++) {
        const mesData = mesesData[i];
        
        if (diaDelMes < 1 || diaDelMes > mesData.dias) {
            continue; 
        }

        const dn = mesData.inicio_dn + (diaDelMes - 1);
        
        const delta_rad = calcularDelta(dn);
        const { omega_s, E0, G0d_kWh } = calcularG0d(latitudRadianes, delta_rad, dn);

        preApiPromises.push({
            mesNombre: mesData.nombre,
            diasEnMes: mesData.dias,
            dn: dn,
            delta: delta_rad,
            E0: E0,
            omega_s: omega_s,
            G0d_kWh: G0d_kWh, 
            GdPromise: obtenerGdOpenMeteo(latitudGrados, longitudGrados, dn) // LLAMADA API
        });
    }

    // --- 2. Esperar API y calcular componentes horizontales (Kd, Dd, Id) ---
    const resultsRaw = await Promise.all(preApiPromises.map(async (item) => {
        try {
            //  Se asigna directamente el resultado NUMÉRICO de la Promesa.
            item.Gd_kWh = await item.GdPromise;
            
            const { Kd, Dd, Id } = calcularComponentesHorizontales(item.Gd_kWh, item.G0d_kWh);
            item.Kd = Kd; 
            item.Dd = Dd; 
            item.Id = Id;
        } catch (error) {
            console.error(`Error en mes ${item.mesNombre}:`, error.message); // Mejor log del error
            item.Gd_kWh = 0; // Marcar como inválido
        }
        return item;
    }));
    
    const datosBaseValidos = resultsRaw.filter(item => 
        typeof item.Gd_kWh === 'number' && item.Gd_kWh > 0
    );

    if (datosBaseValidos.length < 10) { // Si hay menos de 10 meses válidos, el resultado es poco fiable
        return { anguloOptimo: null, GiMinMensual: 0, GiAnualMWh: 0, resultadosMensuales: [] };
    }

    // --- 3. Encontrar Ángulo Óptimo (Maximizar Gi Anual) ---
    const resultadosAnuales = [];
    let maxGiAnual = -1;
    let anguloOptimo = null;

    // Iterar ángulos de 0° a 90° con un paso de 5°
    for (let betaGrados = 0; betaGrados <= 90; betaGrados += 5) {
        let GiAnualTotal = 0;
        const GiMensuales = [];
        const betaRadianes = betaGrados / RAD_A_DEG;
        
        datosBaseValidos.forEach(item => {
            const diasEnMes = item.diasEnMes;
            
            //  CÁLCULO DE RADIACIÓN INCLINADA (Gi)
            const resultadoInclinado = calcularRadiacionInclinada(betaRadianes, item, latitudRadianes);
            
            if (typeof resultadoInclinado.Gi === 'number' && !isNaN(resultadoInclinado.Gi)) {
                GiAnualTotal += resultadoInclinado.Gi * diasEnMes;
                GiMensuales.push(resultadoInclinado.Gi);
            }
        });
        
        const GiAnualMWh = GiAnualTotal / 1000;
        
        resultadosAnuales.push({
            beta: betaGrados,
            GiAnual: GiAnualMWh,
            GiMin: Math.min(...GiMensuales) 
        });

        // Determinar el ángulo que maximiza la producción anual
        if (GiAnualMWh > maxGiAnual) {
            maxGiAnual = GiAnualMWh;
            anguloOptimo = betaGrados;
        }
    }

    // --- 4. Obtener el HSP Mínimo y los resultados mensuales finales ---
    const resultadoOptimo = resultadosAnuales.find(res => res.beta === anguloOptimo);
    const GiMinMensual = resultadoOptimo ? resultadoOptimo.GiMin : 0;
    
    let resultadosMensualesFinal = [];
    if (anguloOptimo !== null) {
        const anguloRadianesOptimo = anguloOptimo / RAD_A_DEG;
        
        resultadosMensualesFinal = datosBaseValidos.map(item => {
            const resultadoInclinadoOptima = calcularRadiacionInclinada(anguloRadianesOptimo, item, latitudRadianes);
            return { 
                ...item, 
                Gi: resultadoInclinadoOptima.Gi, // HSP Mensual Optimizado
                Rb: resultadoInclinadoOptima.Rb,
                Id_beta: resultadoInclinadoOptima.Id_beta,
                Dd_beta: resultadoInclinadoOptima.Dd_beta,
                mesNombre: item.mesNombre, 
                diasEnMes: item.diasEnMes 
            };
        });
    }

    return { 
        anguloOptimo, 
        GiMinMensual, 
        GiAnualMWh: maxGiAnual, 
        resultadosMensuales: resultadosMensualesFinal 
    };
}