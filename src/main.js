/**
 * @fileoverview Lógica principal, manejo de UI, orquestación de cálculos e importaciones de módulos.
 */

// === Importaciones de Módulos ===
import { 
    calcularConsumoTotal, agregarFilaConsumo, eliminarFila, 
    setConsumptionChangeCallback, 
    obtenerPotenciaInstantaneaTotal
} from './utils_consumption.js';
import { 
    PI, RAD_A_DEG, dimensionarGenerador, 
    calcularRadiacionInclinada, obtenerPaisPorCoordenadas, 
    obtenerGdOpenMeteo, calcularDelta, calcularG0d, 
    calcularComponentesHorizontales,
    // --- Fórmulas de Dimensionamiento ---
    calcularNumeroTotalPaneles, 
    calcularPanelesEnSerie, 
    calcularRamasEnParalelo,
    calcularCapacidadNominalBateria,
    // --- FÓRMULAS DEL REGULADOR ---
    calcularCorrienteGenerada, 
    calcularCorrienteConsumida, 
    calcularCorrienteRegulador, 
    calcularInversorNominal
} from './solar_formulas.js';

// === Datos y Variables Globales ===
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

let resultadosMensualesGlobales = []; // Almacenamiento global para resultados intermedios
let radiacionChart; // Variable global para el objeto Chart

// Variable global para almacenar el valor de ET
let ET_Global_Wh = 0;

// =================================================================================
// === FUNCIONES DE UTILERÍA Y UI (Exportada para los otros módulos) ===
// =================================================================================

/**
 * Maneja la aparición de mensajes de error en la UI, reemplazando el alert().
 * @param {string} title Título del mensaje.
 * @param {string} message Mensaje de error a mostrar.
 * @param {string} type Tipo de mensaje ('error', 'warning').
 */
export function mostrarMensaje(title, message, type) {
    const color = type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700';
    const errorDiv = document.createElement('div');
    errorDiv.className = `fixed top-5 right-5 ${color} border px-4 py-3 rounded shadow-xl transition-opacity duration-300 z-50`;
    errorDiv.innerHTML = `<strong>${title}:</strong> ${message}`;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000); 
}

// =================================================================================
// === FUNCIÓN PARA DIBUJAR/ACTUALIZAR EL GRÁFICO ===
// =================================================================================

/**
 * Función para inicializar o actualizar el gráfico de radiación solar.
 * Muestra los valores de Gi (HSP) para los 12 meses.
 * @param {Array<Object>} monthlyResults Resultados mensuales para graficar.
 * @param {number|null} anguloOptimo Ángulo óptimo encontrado.
 */
function actualizarGrafico(monthlyResults, anguloOptimo) {
    const validResults = monthlyResults.filter(item => typeof item.Gi === 'number' && !isNaN(item.Gi));
    
    if (validResults.length === 0) {
        if (radiacionChart) radiacionChart.destroy();
        return;
    }
    
    const ctx = document.getElementById('radiacionChart');
    const meses = validResults.map(item => item.mesNombre);
    const dataGi = validResults.map(item => item.Gi);

    if (radiacionChart) {
        radiacionChart.destroy();
    }
    
    const titulo = anguloOptimo !== null 
        ? `Irradiancia Mensual G_i a ${anguloOptimo.toFixed(1)}° (Ángulo Óptimo)`
        : 'Irradiancia Mensual G_i (Inclinación por Defecto)';

    radiacionChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: meses,
            datasets: [{
                label: 'HSP (kWh/m² día)',
                data: dataGi, 
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Irradiancia Global Inclinada, G_i (HSP) [kWh/m² día]'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: titulo,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: false 
                }
            }
        }
    });
}


// =================================================================================
// === FUNCIÓN MAESTRA: ejecutarCalculos (ORQUESTACIÓN) ===
// =================================================================================

/**
 * Función maestra que coordina la obtención de datos, los cálculos solares y el dimensionamiento.
 */
async function ejecutarCalculos() {
    
    document.getElementById('loading-spinner').style.display = 'block';
    
    // === 1. Obtener y Calcular Consumo Total (ET) ===
    const ET_requerida = ET_Global_Wh; // Ya está en Wh/día
    
    if (ET_requerida <= 0) {
        document.getElementById('loading-spinner').style.display = 'none';
        mostrarMensaje('Advertencia', 'El consumo total diario (ET) es cero o no válido. Asegúrese de ingresar dispositivos y eficiencias correctas.', 'warning');
        if (radiacionChart) radiacionChart.destroy(); 
        
        // Limpiamos los resultados de dimensiónamiento si ET es cero.
        document.getElementById('resultado-anual').innerHTML = '';
        document.getElementById('resultado-baterias').innerHTML = '';
        document.getElementById('resultado-regulador').innerHTML = ''; 
        calcularNumeroPaneles(); // Resetear resultados de paneles
        return; 
    }
    
    // === 2. Obtener entradas Geográficas y Validar ===
    const latitudGrados = parseFloat(document.getElementById('latitud').value);
    const longitudGrados = parseFloat(document.getElementById('longitud').value);
    const diaDelMes = parseInt(document.getElementById('diaDelMes').value);
    
    if (isNaN(latitudGrados) || isNaN(longitudGrados) || isNaN(diaDelMes)) {
        document.getElementById('loading-spinner').style.display = 'none';
        mostrarMensaje('Error', "Por favor, introduce valores válidos en Latitud, Longitud y Día.", 'error');
        if (radiacionChart) radiacionChart.destroy();
        return;
    }

    // ... (El resto del cálculo de Radiación y Búsqueda de Óptimo permanece igual) ...
    
    // Inclinación inicial por defecto (Latitud absoluta) para la tabla mensual
    const inclinacionGradosDefault = Math.abs(latitudGrados); 
    const latitudRadianes = latitudGrados / RAD_A_DEG;
    const inclinacionRadianesDefault = inclinacionGradosDefault / RAD_A_DEG;

    // Actualizar display de inclinación de referencia
    document.getElementById('inclinacion-display').textContent = inclinacionGradosDefault.toFixed(1);
    
    document.getElementById('pais-resultado').innerHTML = "<span class='text-blue-500'>Buscando país y preparando datos...</span>";
    const nombrePais = await obtenerPaisPorCoordenadas(latitudGrados, longitudGrados);
    document.getElementById('pais-resultado').innerHTML = `País: 🗺️ **${nombrePais}**`;
    
    // === 3. Generar cálculos locales y llamadas API (pre-inclinación) ===
    const preApiPromises = [];
    for (let i = 0; i < mesesData.length; i++) {
        const mesData = mesesData[i];
        
        if (diaDelMes < 1 || diaDelMes > mesData.dias) {
            preApiPromises.push({ mesNombre: mesData.nombre, isInvalid: true, diasEnMes: mesData.dias, dn: mesData.inicio_dn + 14 }); 
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
            GdPromise: obtenerGdOpenMeteo(latitudGrados, longitudGrados, dn) 
        });
    }

    // === 4. Esperar API y calcular parámetros horizontales (Kd, Dd, Id) ===
    const resultsRaw = await Promise.all(preApiPromises.map(async (item) => {
        if (item.isInvalid) return item; 

        item.Gd_kWh_string = await item.GdPromise; 
        item.Gd_kWh = parseFloat(item.Gd_kWh_string);
        
        const { Kd, Dd, Id } = calcularComponentesHorizontales(item.Gd_kWh, item.G0d_kWh);
        item.Kd = Kd; 
        item.Dd = Dd; 
        item.Id = Id;

        return item;
    }));
    
    resultadosMensualesGlobales = resultsRaw.filter(item => 
        !item.isInvalid && 
        typeof item.Gd_kWh === 'number' && 
        !isNaN(item.Gd_kWh) && 
        item.Gd_kWh > 0
    ).map(item => { 
        const calcInclinada = calcularRadiacionInclinada(inclinacionRadianesDefault, item, latitudRadianes);
        return { ...item, Gi: calcInclinada.Gi, mesNombre: item.mesNombre, diasEnMes: item.diasEnMes };
    });
    
    // === 5. Generar Tabla Mensual Detallada para la inclinación seleccionada ===
    generarTablaMensual(resultsRaw, inclinacionRadianesDefault, inclinacionGradosDefault, latitudRadianes);
    
    // === 6. Generar Tabla Resumen Anual por Ángulo ===
    const { anguloOptimo, GiMinMensual } = generarTablaAnualOptima(latitudRadianes);

    document.getElementById('inclinacion-display').textContent = anguloOptimo !== null ? anguloOptimo.toFixed(1) : inclinacionGradosDefault.toFixed(1) + ' (Fallo)';

    // === 7. GRÁFICOS: Actualizar Gráfico ===
    if (anguloOptimo !== null) {
        const anguloRadianesOptimo = anguloOptimo / RAD_A_DEG;
        resultadosMensualesGlobales = resultadosMensualesGlobales.map(item => {
            const calcInclinadaOptima = calcularRadiacionInclinada(anguloRadianesOptimo, item, latitudRadianes);
            return { ...item, Gi: calcInclinadaOptima.Gi }; // Reemplazar Gi con el valor óptimo
        });
    }

    actualizarGrafico(resultadosMensualesGlobales, anguloOptimo); 

    // =========================================================================
    // === 8. Dimensionamiento Final del Generador, Baterías y Regulador ===
    // =========================================================================
    if (anguloOptimo !== null && GiMinMensual > 0) {
        const Cp_valor_estandar = 0.8; 
        const PpicoRequerida = dimensionarGenerador(ET_requerida, GiMinMensual, Cp_valor_estandar);
        
        // Autollenar Inputs de Generador
        const ET_en_KWH = ET_requerida / 1000;
        document.getElementById('input-et').value = ET_en_KWH.toFixed(2);
        document.getElementById('input-hps').value = GiMinMensual.toFixed(2);
        
        let resumenDimensionamientoHTML = `
            <div class="mt-8 p-6 border-4 border-yellow-400 bg-yellow-100 rounded-lg w-full">
                <h3 class="text-xl font-bold text-gray-800"> Dimensionamiento del Generador</h3>
                <p class="text-lg mt-2">Ángulo Óptimo de Inclinación  β: <strong class="text-green-600">${anguloOptimo.toFixed(1)}°</strong></p>
                <p class="text-lg">HSP Mínima (Mes Desfavorable): <strong class="text-red-600">${GiMinMensual.toFixed(2)} kWh/m² día</strong></p>
                <p class="text-xl mt-3 font-extrabold text-blue-800">Potencia Pico Requerida P<sub>p</sub>: 
                    <span class="resaltado-resultado">${PpicoRequerida.toFixed(2)} Wp</span>
                </p>
                <p class="text-sm text-gray-600 mt-2">(*Asumiendo un **Factor de Pérdidas del Sistema (PR)** $C_p=${Cp_valor_estandar.toFixed(1)}$$)</p>
            </div>
        `;
        document.getElementById('resultado-anual').insertAdjacentHTML('beforeend', resumenDimensionamientoHTML);
        
        // LLAMADA FINAL: EJECUTA EL CÁLCULO DE PANELES 
        calcularNumeroPaneles();
        
        // LLAMADA FINAL: EJECUTA EL CÁLCULO DE BATERÍAS
        calcularCapacidadBaterias(); 
        
        // LLAMADA FINAL: EJECUTA EL CÁLCULO DEL REGULADOR
        calcularCorrienteReguladorFinal(); 

    } else {
        // Si no hay datos de radiación válidos, limpiamos la sección.
        document.getElementById('resultado-anual').innerHTML = `<p class='text-center text-red-600 font-semibold'>No se pudo obtener la Irradiancia (HSP) para dimensionar el generador.</p>`;
        document.getElementById('resultado-baterias').innerHTML = ''; 
        document.getElementById('resultado-regulador').innerHTML = ''; 
        calcularNumeroPaneles(); // Resetear resultados de paneles
    }

    document.getElementById('loading-spinner').style.display = 'none';

}

// --- FUNCIÓN PARA GENERAR TABLA MENSUAL DETALLADA (Sin cambios) ---
function generarTablaMensual(results, inclinacionRadianes, inclinacionGrados, latitudRadianes) {
    let resultadosHTML = "<table id='tabla-mensual'>";
    // 
    resultadosHTML += `<thead class="sticky-header"><tr>
        <th>Mes</th>
        <th>d<sub>n</sub></th>
        <th>δ </th>
        <th>G<sub>0d</sub>{kWh/m}</th>
        <th>G<sub>d</sub> {kWh/m}</th>
        <th>D<sub>d</sub> {kWh/m}</th>
        <th>I<sub>d</sub> {kWh/m}</th>
        <th>R<sub>b</sub></th>
        <th>I<sub>d β</sub> {kWh/m}</th>
        <th>D<sub>d β</sub> {kWh/m}</th>
        <th>G<sub>i</sub> (HSP){kWh/m}</th>
    </tr></thead><tbody>`;
    
    results.forEach(item => {
        if (item.isInvalid) {
            resultadosHTML += `<tr><td>${item.mesNombre}</td><td colspan="10" class="error-msg">Día ${document.getElementById('diaDelMes').value} inválido (máx. ${item.diasEnMes} días)</td></tr>`;
            return;
        }

        // Calcular Gi para este mes y el ángulo seleccionado
        const calcInclinada = calcularRadiacionInclinada(inclinacionRadianes, item, latitudRadianes);
        
        // Conversión y visualización de resultados
        const delta_grados = (item.delta * RAD_A_DEG).toFixed(2);
        const G0d_display = item.G0d_kWh.toFixed(2);
        
        let gd_display = item.Gd_kWh_string;
        let dd_display = isNaN(item.Dd) ? 'N/A' : item.Dd.toFixed(2);
        let id_display = isNaN(item.Id) ? 'N/A' : item.Id.toFixed(2);
        
        let rb_display = isNaN(calcInclinada.Rb) ? 'N/A' : calcInclinada.Rb.toFixed(3);
        let id_beta_display = isNaN(calcInclinada.Id_beta) ? 'N/A' : calcInclinada.Id_beta.toFixed(2);
        let dd_beta_display = isNaN(calcInclinada.Dd_beta) ? 'N/A' : calcInclinada.Dd_beta.toFixed(2);
        let gi_display = isNaN(calcInclinada.Gi) ? 'N/A' : calcInclinada.Gi.toFixed(2);

        if (gd_display.includes("Error") || gd_display.includes("no disponibles")) {
            gd_display = `<span class="error-msg">${gd_display}</span>`;
            gi_display = `<span class="error-msg">N/A</span>`; 
        }

        resultadosHTML += `<tr>
            <td>${item.mesNombre}</td>
            <td>${item.dn}</td>
            <td>${delta_grados}</td> 
            <td>${G0d_display}</td>
            <td>${gd_display}</td>
            <td>${dd_display}</td>
            <td>${id_display}</td> 
            <td>${rb_display}</td> 
            <td>${id_beta_display}</td>
            <td>${dd_beta_display}</td>
            <td>${gi_display}</td>
        </tr>`;
    });

    resultadosHTML += "</tbody></table>";
    document.getElementById('resultado-mensual').innerHTML = resultadosHTML;
}

// --- FUNCIÓN PARA GENERAR TABLA ANUAL POR ÁNGULO (Sin cambios) ---
function generarTablaAnualOptima(latitudRadianes) {
    if (resultadosMensualesGlobales.length === 0) {
        document.getElementById('resultado-anual').innerHTML = "<p class='text-center text-red-600 font-semibold'>No hay datos válidos (G_d) suficientes para calcular la tabla anual. Verifique la tabla mensual.</p>";
        return { anguloOptimo: null, GiMinMensual: 0 };
    }

    const resultadosAnuales = [];
    let maxGiAnual = -1;
    let anguloOptimo = null;
    let GiMinMensual = Infinity; 

    // Recorrer ángulos de 0° a 90° (pasos de 5°)
    for (let betaGrados = 0; betaGrados <= 90; betaGrados += 5) {
        let GiAnualTotal = 0;
        const GiMensuales = [];
        const betaRadianes = betaGrados / RAD_A_DEG;
        
        resultadosMensualesGlobales.forEach(item => {
            const diasEnMes = item.diasEnMes;
            
            // Cálculo de la Radiación Inclinada (Gi) para este mes y este ángulo (beta)
            const calcInclinada = calcularRadiacionInclinada(betaRadianes, item, latitudRadianes);
            
            if (typeof calcInclinada.Gi === 'number' && !isNaN(calcInclinada.Gi)) {
                GiAnualTotal += calcInclinada.Gi * diasEnMes;
                GiMensuales.push(calcInclinada.Gi);
            }
        });
        
        // Conversión: Pasar de kWh/m² año a MWh/m² año (dividir por 1000)
        const GiAnualMWh = GiAnualTotal / 1000;
        
        resultadosAnuales.push({
            beta: betaGrados,
            GiAnual: GiAnualMWh,
            GiMin: Math.min(...GiMensuales) 
        });

        if (GiAnualMWh > maxGiAnual) {
            maxGiAnual = GiAnualMWh;
            anguloOptimo = betaGrados;
        }
    }

    const resultadoOptimo = resultadosAnuales.find(res => res.beta === anguloOptimo);
    if (resultadoOptimo) {
        GiMinMensual = resultadoOptimo.GiMin;
    }


    // Generar HTML de la tabla de resumen
    let tablaOptimaHTML = `<table id='tabla-optima'>
        <tr>
            <th>β(°)</th>
            <th>G<sub>i</sub>{MWh/m}año </th>
            <th>HSP Mínima {kWh/m}día</th>
        </tr>`;
        
    resultadosAnuales.forEach(res => {
        const isOptimo = res.beta === anguloOptimo;
        const clase = isOptimo ? 'destacado' : '';
        
        tablaOptimaHTML += `<tr class="${clase}">
            <td>${res.beta}° ${isOptimo ? ' (ÓPTIMO)' : ''}</td>
            <td>${res.GiAnual.toFixed(3)}</td>
            <td>${res.GiMin.toFixed(2)}</td>
        </tr>`;

    });
    
    tablaOptimaHTML += "</table>";
    document.getElementById('resultado-anual').innerHTML = tablaOptimaHTML;

    // Devolver el ángulo óptimo y la Gi mínima (HSP mínima)
    return { anguloOptimo: anguloOptimo, GiMinMensual: GiMinMensual };
}

/**
 * Limpia todos los campos del formulario y resultados.
 */
function limpiarFormulario() {
    document.getElementById('latitud').value = '';
    document.getElementById('longitud').value = '';
    document.getElementById('diaDelMes').value = ''; 
    
    // Limpiar campos de consumo y resetear a default
    document.getElementById('etaBat').value = '0.90';
    document.getElementById('etaInv').value = '0.95';
    document.getElementById('cuerpo-tabla-consumo').innerHTML = ''; 
    document.getElementById('consumo-total-resultado').textContent = '0 Wh/día';
    agregarFilaConsumo(); // Función importada
    
    // Limpiar resultados de irradiación
    document.getElementById('pais-resultado').innerHTML = '';
    document.getElementById('resultado-mensual').innerHTML = '';
    document.getElementById('resultado-anual').innerHTML = '';
    document.getElementById('inclinacion-display').textContent = '';
    document.getElementById('resultado-baterias').innerHTML = ''; 
    document.getElementById('resultado-regulador').innerHTML = ''; 

    // Limpiar los inputs de paneles y resetear a valores comunes
    document.getElementById('input-et').value = '';
    document.getElementById('input-hps').value = '';
    document.getElementById('input-pp').value = '450'; 
    document.getElementById('input-pg').value = '0.8'; 
    
    // Limpiar inputs de matriz (nuevos)
    document.getElementById('input-vbat').value = '48'; // Tensión común de banco (V)
    document.getElementById('input-vp').value = '24'; // Tensión nominal común de panel (V)
    // Limpiar inputs de autonomía (Días de autonomía y Pd, restableciendo a valores comunes si es necesario)
    document.getElementById('input-autonomia').value = '2'; // Restablece el valor inicial si se borró
    document.getElementById('input-pd').value = '0.5'; // Restablece el valor inicial si se borró

    // Limpiar resultados de paneles
    document.getElementById('resultado-paneles').innerHTML = '0';
    document.getElementById('resultado-matriz').innerHTML = ''; // Nuevo elemento de matriz

    // Resetear la variable global de ET
    ET_Global_Wh = 0; 
    
    if (radiacionChart) {
        radiacionChart.destroy();
    }
}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE PANELES (Generador) ===
// =========================================================================

/**
 * Calcula el número total de paneles (NT) y la configuración de matriz (Ns, Np) utilizando las funciones de solar_formulas.js.
 */
function calcularNumeroPaneles() {
    // 1. Obtener valores de los inputs (Generador)
    // Et y HPS se leen en kWh/día (como se autocompletan)
    const Et_kwh = parseFloat(document.getElementById('input-et').value);
    const HPS_kwh = parseFloat(document.getElementById('input-hps').value);
    const Pp_Wp = parseFloat(document.getElementById('input-pp').value); 
    const Pg = parseFloat(document.getElementById('input-pg').value);
    
    // 2. Obtener valores de los inputs (Matriz)
    const V_BAT = parseFloat(document.getElementById('input-vbat').value);
    const Vp = parseFloat(document.getElementById('input-vp').value);

    const resultadoElement = document.getElementById('resultado-paneles');
    const resultadoMatrizElement = document.getElementById('resultado-matriz');

    // Limpiar resultado anterior
    resultadoElement.innerHTML = `<span class="resaltado-resultado">0</span>`;
    resultadoMatrizElement.innerHTML = ``;
    
    // 3. Validación Mínima para NT
    if (isNaN(Et_kwh) || isNaN(HPS_kwh) || isNaN(Pp_Wp) || isNaN(Pg) || 
        Et_kwh <= 0 || HPS_kwh <= 0 || Pp_Wp <= 0 || Pg <= 0) {
        
        resultadoElement.textContent = "Error: Revise los datos de Consumo (Et/HPS), Potencia de Panel (Pp) y Factor de Pérdidas (Pg).";
        return;
    }

    // 4. Conversión de Et a Wh (necesario para la función calcularNumeroTotalPaneles)
    const Et_wh = Et_kwh * 1000;

    // 5. CÁLCULO DE NÚMERO TOTAL DE PANELES (NT)
    const Nt_total_float = calcularNumeroTotalPaneles(Et_wh, HPS_kwh, Pp_Wp, Pg);
    const Nt_total = Math.ceil(Nt_total_float); 

    // 6. VALIDACIÓN DE CÁLCULO DE MATRIZ
    if (isNaN(V_BAT) || isNaN(Vp) || V_BAT <= 0 || Vp <= 0) {
        resultadoElement.innerHTML = `
            <span class="resaltado-resultado">${Nt_total}</span>
            <p class="text-sm text-gray-600 mt-2">(${Nt_total_float.toFixed(2)} sin redondear)</p>
            <p class="text-sm text-red-600 mt-2 font-bold">⚠️ Ingrese V<sub>BAT</sub> y V<sub>p</sub>para calcular Ns y Np.</p>
        `;
        return;
    }
    
    // 7. CÁLCULO DE CONFIGURACIÓN DE MATRIZ (Ns y Np)
    const Ns = calcularPanelesEnSerie(V_BAT, Vp);
    const Np = calcularRamasEnParalelo(Nt_total, Ns);

    // 8. Visualización de Resultados
    resultadoElement.innerHTML = `
        <span class="resaltado-resultado">${Nt_total}</span>
        <p class="text-sm text-gray-600 mt-1">(${Nt_total_float.toFixed(2)} sin redondear)</p>
    `;

    // Tabla de Matriz
    resultadoMatrizElement.innerHTML = `
        <div class="mt-4 p-4 bg-purple-50 rounded-lg shadow-md">
            <h4 class="text-lg font-bold text-purple-700 mb-2">Configuración de Matriz FV:</h4>
            <div class="grid grid-cols-3 gap-2 text-center font-mono">
                <div class="p-2 bg-purple-200 rounded">
                    <p class="text-sm text-purple-800">Total (Nt)</p>
                    <p class="text-xl font-extrabold">${Nt_total}</p>
                </div>
                <div class="p-2 bg-purple-200 rounded">
                    <p class="text-sm text-purple-800">Serie (Ns)</p>
                    <p class="text-xl font-extrabold">${Ns}</p>
                </div>
                <div class="p-2 bg-purple-200 rounded">
                    <p class="text-sm text-purple-800">Paralelo (Np)</p>
                    <p class="text-xl font-extrabold">${Np}</p>
                </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">Nota: Se necesitan N<sub>T</sub>=${Nt_total} paneles, organizados en ${Np} ramas en paralelo, cada una con ${Ns} paneles en serie.</p>
        </div>
    `;
    
    console.log(`Dimensionamiento: Nt=${Nt_total}, Ns=${Ns}, Np=${Np}.`);
    
    // Ejecutar el cálculo del regulador, ya que Np se ha actualizado
    calcularCorrienteReguladorFinal(); 
}


// =========================================================================
// === FUNCIÓN DE CÁLCULO DE BATERÍAS ===
// =========================================================================

/**
 * Calcula y muestra la Capacidad Nominal del Banco de Baterías (Cn).
 */
function calcularCapacidadBaterias() { 
    //Lee ET (consumo) directamente del input autocompletado
    const consumoDiarioKWh = parseFloat(document.getElementById('input-et').value || 0);
    const ET_requeridaWh = consumoDiarioKWh * 1000;
    
    const D_dias = parseFloat(document.getElementById('input-autonomia').value) || 2; 
    const Vbat_voltios = parseFloat(document.getElementById('input-vbat').value);
    const Pd_descarga = parseFloat(document.getElementById('input-pd').value) || 0.5; 
    
    const resultadoElement = document.getElementById('resultado-baterias');
    resultadoElement.innerHTML = '';
    
    if (ET_requeridaWh <= 0 || isNaN(D_dias) || D_dias <= 0 || isNaN(Vbat_voltios) || Vbat_voltios <= 0 || isNaN(Pd_descarga) || Pd_descarga <= 0 || Pd_descarga > 1) {
        resultadoElement.innerHTML = `<p class="text-sm text-red-600 font-bold">⚠️ Revise los datos de Consumo (Et), Autonomía (D), Voltaje de Batería (Vbat) y Profundidad de Descarga (Pd).</p>`;
        return;
    }
    
    const Cn_Ah = calcularCapacidadNominalBateria(ET_requeridaWh, D_dias, Vbat_voltios, Pd_descarga);

    const energiaAutonomiaWh = D_dias * ET_requeridaWh;
    const energiaAutonomiaKWh = (energiaAutonomiaWh / 1000).toFixed(2);

    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-teal-400 bg-teal-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">🔋 Dimensionamiento del Banco de Baterías</h3>
            <p class="text-lg mt-2">Días de Autonomía Requeridos: <strong>${D_dias} días</strong></p>
            <p class="text-lg">Energía de Autonomía : <strong class="text-teal-600">${energiaAutonomiaKWh} kWh</strong></p>
            <p class="text-lg">Profundidad de Descarga Máxima P<sub>d</sub>: <strong>${(Pd_descarga * 100).toFixed(0)}%</strong></p>
            <p class="text-xl mt-3 font-extrabold text-blue-800">Capacidad Nominal Requerida C<sub>n</sub>: 
                <span class="resaltado-resultado">${Cn_Ah} Ah</span>
            </p>
            <p class="text-sm text-gray-600 mt-2">(*Capacidad mínima requerida a ${Vbat_voltios}V.)</p>
        </div>
    `;
    
    // Ejecutar el cálculo del regulador, ya que Vbat se ha actualizado
    calcularCorrienteReguladorFinal(); 
}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE REGULADOR ===
// =========================================================================

/**
 * Calcula y muestra la corriente máxima requerida para el Regulador (IR).
 * Depende de: Np (del cálculo de paneles), Vbat (input), y los datos de Potencia de Carga (Pdc, Pac).
 */
function calcularCorrienteReguladorFinal() {
    
    // 1. Obtener datos de Generador (Necesitamos Np y datos del panel)
    const Pp_Wp = parseFloat(document.getElementById('input-pp').value) || 0; // Potencia del panel
    const VpmpP = parseFloat(document.getElementById('input-vp').value) || 0; // Usamos Vp como proxy de VpmpP

    // Repetimos el cálculo de Np (Número de ramas en paralelo) para asegurar el dato actualizado.
    const Et_kwh = parseFloat(document.getElementById('input-et').value) || 0;
    const HPS_kwh = parseFloat(document.getElementById('input-hps').value) || 0;
    const Pg = parseFloat(document.getElementById('input-pg').value) || 0;
    const V_BAT = parseFloat(document.getElementById('input-vbat').value) || 0;
    const Vp = parseFloat(document.getElementById('input-vp').value) || 0; 
    
    let Np = 0;
    if (Et_kwh > 0 && HPS_kwh > 0 && Pp_Wp > 0 && Pg > 0 && V_BAT > 0 && Vp > 0) {
        const Nt_total = Math.ceil(calcularNumeroTotalPaneles(Et_kwh * 1000, HPS_kwh, Pp_Wp, Pg));
        const Ns = calcularPanelesEnSerie(V_BAT, Vp);
        Np = calcularRamasEnParalelo(Nt_total, Ns);
    }
    
    // 2. Obtener datos de Consumo (PDC y PAC)
    // Usamos la nueva función importada para obtener la Potencia Instantánea Máxima (W) de las cargas.
    const { Pdc_W, Pac_W } = obtenerPotenciaInstantaneaTotal(); // <<-- ¡MODIFICADO!
    
    const Vbat_voltios = V_BAT;
    const resultadoElement = document.getElementById('resultado-regulador'); 

    if (!resultadoElement) return;
    resultadoElement.innerHTML = '';

    // 3. Validación Mínima
    if (Np <= 0 || Vbat_voltios <= 0 || Pp_Wp <= 0 || VpmpP <= 0 || Pdc_W + Pac_W <= 0) {
        // Limpiamos si los datos clave no son válidos
        return; 
    }
    
    // 4. CÁLCULO DE CORRIENTES
    
    // Corriente Generada (IG)
    const IG = calcularCorrienteGenerada(Pp_Wp, VpmpP, Np);

    // Corriente Consumida (IC) 
    const IC = calcularCorrienteConsumida(Pdc_W, Vbat_voltios, Pac_W);

    // Corriente del Regulador (IR)
    const IR_final = calcularCorrienteRegulador(IG, IC); // Incluye el factor de seguridad (1.25) y redondeo.
    
    // 5. Visualización de Resultados
    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-orange-400 bg-orange-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">⚡ Dimensionamiento del Regulador de Carga</h3>
            <div class="grid grid-cols-3 gap-4 mt-2 text-center">
                <div class="p-2 bg-orange-200 rounded">
                    <p class="text-sm text-orange-800">Corriente Generada I<sub>G</sub></p>
                    <p class="text-lg font-bold text-red-700">${IG.toFixed(2)} A</p>
                </div>
                <div class="p-2 bg-orange-200 rounded">
                    <p class="text-sm text-orange-800">Corriente Consumida I<sub>C</sub></p>
                    <p class="text-lg font-bold text-red-700">${IC.toFixed(2)} A</p>
                </div>
                <div class="p-2 bg-orange-200 rounded">
                    <p class="text-sm text-orange-800">Corriente Máxima I<sub>R</sub></p>
                    <p class="text-xl font-extrabold text-red-700">${IR_final} A</p>
                </div>
            </div>
            <p class="text-sm text-gray-600 mt-2">Regulador recomendado: ${IR_final}A (incluye factor de seguridad del 25% y redondeo al alza)</p>
        </div>
    `;
}
/**
 * Calcula y muestra el dimensionamiento del Inversor.
 */
 export function calcularInversorFinal() {
    // 1. Obtener entradas
    const V_BAT = parseFloat(document.getElementById('input-vbat')?.value) || 0;
    
    // Obtener la potencia AC total de la tabla de consumo
    const { Pdc_W, Pac_W } = obtenerPotenciaInstantaneaTotal();

    const resultadoDiv = document.getElementById('resultado-inversor');
    if (!resultadoDiv) return;

    // Verificar datos
    if (V_BAT <= 0 || Pac_W <= 0) {
        resultadoDiv.innerHTML = `<p class="text-gray-500 font-semibold text-center">Ingrese el Voltaje de Batería y registre cargas AC en la tabla de Consumo.</p>`;
        return;
    }

    // 2. Calcular la potencia nominal mínima requerida
    const FACTOR_SEGURIDAD = 1.25; // 25% de margen
    const P_nominal_W = calcularInversorNominal(Pac_W, FACTOR_SEGURIDAD);

    const P_nominal_kW = P_nominal_W / 1000;
    
    // 3. Mostrar resultados
    resultadoDiv.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div class="p-3 bg-white rounded-lg shadow-sm border border-blue-200">
                <p class="text-xs font-medium text-blue-600">Potencia Máxima AC (P<sub>AC</sub>)</p>
                <p class="text-xl font-bold text-blue-800">${Pac_W.toFixed(2)} W</p>
            </div>
            <div class="p-3 bg-blue-100 rounded-lg shadow-md border border-blue-400">
                <p class="text-sm font-medium text-blue-800">Potencia Nominal Mínima Requerida</p>
                <p class="text-2xl font-extrabold text-blue-900">${P_nominal_W.toFixed(0)} W</p>
                <p class="text-sm font-bold text-blue-700">(${P_nominal_kW.toFixed(2)} kW)</p>
            </div>
            <div class="p-3 bg-white rounded-lg shadow-sm border border-blue-200">
                <p class="text-xs font-medium text-blue-600">Tensión de Entrada Requerida</p>
                <p class="text-xl font-bold text-blue-800">${V_BAT} V</p>
            </div>
        </div>
        <p class="mt-4 text-sm text-gray-600 text-center">
            El inversor debe soportar al menos ${P_nominal_W.toFixed(0)} W (${P_nominal_kW.toFixed(2)} kW) y tener una Tensión de Entrada de ${V_BAT} V.
            (Incluye ${((FACTOR_SEGURIDAD - 1) * 100).toFixed(0)}% de margen de seguridad y no se recomienda sobredimensionar)
        </p>
    `;
}

// Asegúrate de exportarla y luego llamarla al recalcular Paneles/Baterías:
window.calcularInversorFinal = calcularInversorFinal;

// =========================================================================
// === ORQUESTACIÓN Y LISTENERS ===
// =========================================================================

/**
 * Función que maneja el cambio de consumo (callback) y dispara los cálculos principales.
 * @param {number} newET_Wh Nuevo valor de la Energía Total diaria en Wh/día.
 */
function handleConsumptionChange(newET_Wh) { 
    ET_Global_Wh = newET_Wh;
    
    if (ET_Global_Wh > 0) {
        // Si hay consumo, re-ejecutamos los cálculos completos (incluye radiación y autocompletado de inputs)
        ejecutarCalculos(); 
    } else {
        // Si ET es 0, limpiamos la UI de dimensionamiento
        document.getElementById('resultado-anual').innerHTML = '';
        document.getElementById('resultado-baterias').innerHTML = '';
        document.getElementById('resultado-regulador').innerHTML = '';
        calcularNumeroPaneles(); // Resetear los resultados de paneles/matriz
    }
    // Calcular baterías y regulador de forma independiente si los inputs cambian (Vbat, D, Pd, etc.) y hay un ET cargado.
    calcularCapacidadBaterias(); 
    calcularCorrienteReguladorFinal(); 
    calcularInversorFinal();
}


// Event Listeners y Configuración Inicial
document.addEventListener('DOMContentLoaded', () => {
    // 1. Enlazar el callback del consumo
    setConsumptionChangeCallback(handleConsumptionChange); 
    
    // 2. Ejecutar cálculos principales al hacer clic en el botón (Geografía)
    document.getElementById('btn-calcular').addEventListener('click', ejecutarCalculos);
    
    // 3. Re-ejecutar cálculos principales si cambian los datos de Geografía
    document.getElementById('latitud').addEventListener('input', ejecutarCalculos);
    document.getElementById('longitud').addEventListener('input', ejecutarCalculos);
    document.getElementById('diaDelMes').addEventListener('input', ejecutarCalculos);

    // 4. Re-ejecutar cálculos de matriz, batería y regulador si cambian los inputs relacionados
    document.getElementById('input-pp').addEventListener('input', calcularNumeroPaneles);
    document.getElementById('input-pg').addEventListener('input', calcularNumeroPaneles);
    
    // Listeners para las fórmulas de matriz y batería (que solo dependen de su sección)
    document.getElementById('input-vbat').addEventListener('input', () => {
        calcularNumeroPaneles(); 
        calcularCapacidadBaterias(); 
    });
    document.getElementById('input-vp').addEventListener('input', calcularNumeroPaneles);
    
    // Listener para los datos de Batería y Regulador
    document.getElementById('input-autonomia').addEventListener('input', calcularCapacidadBaterias);
    document.getElementById('input-pd').addEventListener('input', calcularCapacidadBaterias);
    
    // Iniciar con el cálculo de consumo para obtener el ET inicial
    calcularConsumoTotal();
});


// =========================================================================
// === EXPOSICIÓN DE FUNCIONES GLOBALES (Para que el HTML encuentre los 'onclick' y 'oninput') ===
// =========================================================================

// Funciones de Consumo (importadas desde utils_consumption.js)
window.agregarFilaConsumo = agregarFilaConsumo;
window.eliminarFila = eliminarFila;
window.calcularConsumoTotal = calcularConsumoTotal; 
window.obtenerPotenciaInstantaneaTotal = obtenerPotenciaInstantaneaTotal; // <<-- EXPUESTA

// Funciones Principales (llamadas por onclick/oninput en index.html)
window.ejecutarCalculos = ejecutarCalculos;
window.limpiarFormulario = limpiarFormulario;
window.calcularNumeroPaneles = calcularNumeroPaneles;
window.calcularCapacidadBaterias = calcularCapacidadBaterias;
window.calcularCorrienteReguladorFinal = calcularCorrienteReguladorFinal;