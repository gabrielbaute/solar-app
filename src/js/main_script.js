/**
 * @fileoverview Lógica principal, manejo de UI, orquestación de cálculos e importaciones de módulos.

 */

// === Importaciones de Módulos ===
import { 
    calcularConsumoTotal, agregarFilaConsumo, eliminarFila, 
    setConsumptionChangeCallback, 
    obtenerPotenciaInstantaneaTotal // Esta función debe devolver { Pdc_W, Pac_W }
} from './utils_consumption.js';
import { 
    // Fórmulas de Geografía y Conversión
    RAD_A_DEG, 
    // Fórmulas de Dimensionamiento
    dimensionarGenerador, 
    calcularNumeroTotalPaneles, 
    calcularPanelesEnSerie, 
    calcularRamasEnParalelo,
    calcularCapacidadNominalBateria,
    calcularCorrienteGenerada, 
    calcularCorrienteConsumida, 
    calcularCorrienteRegulador, 
    calcularInversorNominal,
    calcularPerdidasJoule 
} from './solar_formulas.js';

import { calcularRadiacionOptima } from './solar_radiation_core.js'; 
import { obtenerPaisPorCoordenadas } from './solar_formulas.js'; // Necesario para la UI

// === Datos y Variables Globales ===
let resultadosMensualesGlobales = []; // Almacenamiento global para resultados intermedios
let radiacionChart; // Variable global para el objeto Chart
let ET_Global_Wh = 0; // Variable global para almacenar el valor de ET


// =================================================================================
// === UTILERÍA Y UI (Funciones Auxiliares) ===
// =================================================================================

/**
 * Muestra mensajes de feedback en la UI.
 * @param {string} title Título del mensaje.
 * @param {string} message Mensaje de error a mostrar.
 * @param {string} type Tipo de mensaje ('error', 'warning', 'success').
 */
export function mostrarMensaje(title, message, type) {
    let colorClass = 'bg-blue-100 border-blue-400 text-blue-700';
    if (type === 'error') {
        colorClass = 'bg-red-100 border-red-400 text-red-700';
    } else if (type === 'warning') {
        colorClass = 'bg-yellow-100 border-yellow-400 text-yellow-700';
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = `fixed top-5 right-5 ${colorClass} border px-4 py-3 rounded shadow-xl transition-opacity duration-300 z-50`;
    errorDiv.innerHTML = `<strong>${title}:</strong> ${message}`;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000); 
}

/**
 * Función para inicializar o actualizar el gráfico de radiación solar.
 */
function actualizarGrafico(monthlyResults, anguloOptimo) {
    const validResults = monthlyResults.filter(item => typeof item.Gi === 'number' && !isNaN(item.Gi));
    
    const contenedorGrafico = document.getElementById('contenedor-grafico');
    const tituloGrafico = document.getElementById('titulo-grafico');
    
    if (validResults.length === 0) {
        if (radiacionChart) radiacionChart.destroy();
        if (contenedorGrafico) contenedorGrafico.classList.add('hidden');
        if (tituloGrafico) tituloGrafico.classList.add('hidden');
        return;
    }
    
    const ctx = document.getElementById('radiacionChart');
    const meses = validResults.map(item => item.mesNombre);
    const dataGi = validResults.map(item => item.Gi);

    if (radiacionChart) {
        radiacionChart.destroy();
    }
    
    const titulo = anguloOptimo !== null 
        ? `Irradiancia Mensual G<sub>i</sub> ${anguloOptimo.toFixed(1)}° (Ángulo Óptimo)`
        : 'Irradiancia Mensual G<sub>i</sub> (Inclinación por Defecto)';

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
                        text: 'Irradiancia Global Inclinada, G<sub>i</sub> (HSP) [kWh/m² día]'
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
    
    if (contenedorGrafico) contenedorGrafico.classList.remove('hidden');
    if (tituloGrafico) tituloGrafico.classList.remove('hidden');
}


// --- FUNCIÓN PARA GENERAR TABLA MENSUAL DETALLADA ---
function generarTablaMensual(results, inclinacionRadianes, inclinacionGrados, latitudRadianes) {
    let resultadosHTML = "<table id='tabla-mensual'>";
    resultadosHTML += `<thead class="sticky-header"><tr>
        <th>Mes</th>
        <th>d<sub>n</sub></th>
        <th>δ </th>
        <th>G<sub>0d</sub> (kWh/m)</th>
        <th>G<sub>d</sub> (kWh/m)</th>
        <th>D<sub>d</sub> (kWh/m)</th>
        <th>I<sub>d</sub> (kWh/m)</th>
        <th>R<sub>b</sub></th>
        <th>I<sub>d β</sub> (kWh/m)</th>
        <th>D<sub>d β</sub> (kWh/m)</th>
        <th>G<sub>i</sub> (HSP)(kWh/m)</th>
    </tr></thead><tbody>`;
    
    results.forEach(item => {
        const delta_grados = (item.delta * RAD_A_DEG).toFixed(2);
        const G0d_display = item.G0d_kWh.toFixed(2);
        let gd_display = item.Gd_kWh.toFixed(2);
        let dd_display = isNaN(item.Dd) ? 'N/A' : item.Dd.toFixed(2);
        let id_display = isNaN(item.Id) ? 'N/A' : item.Id.toFixed(2);
        let rb_display = isNaN(item.Rb) ? 'N/A' : item.Rb.toFixed(3);
        let id_beta_display = isNaN(item.Id_beta) ? 'N/A' : item.Id_beta.toFixed(2);
        let dd_beta_display = isNaN(item.Dd_beta) ? 'N/A' : item.Dd_beta.toFixed(2);
        let gi_display = isNaN(item.Gi) ? 'N/A' : item.Gi.toFixed(2);

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

// --- Función para generar tabla anual de resumen ---
function generarTablaAnualResumen(anguloOptimo, GiMinMensual, GiAnualMWh) {
    if (anguloOptimo === null) return;
    
    let tablaOptimaHTML = `<table id='tabla-optima'>
        <tr>
            <th>β(°)</th>
            <th>G<sub>i</sub>{MWh/m}año </th>
            <th>HSP Mínima {kWh/m}día</th>
        </tr>`;
        
    tablaOptimaHTML += `<tr class="destacado">
        <td>${anguloOptimo.toFixed(1)}° (ÓPTIMO)</td>
        <td>${GiAnualMWh.toFixed(3)}</td>
        <td>${GiMinMensual.toFixed(2)}</td>
    </tr>`;
    
    tablaOptimaHTML += "</table>";
    document.getElementById('resultado-anual').innerHTML = tablaOptimaHTML;
}

/**
 * Limpia todos los campos del formulario.
 */
function limpiarFormulario() {
    document.getElementById('latitud').value = '';
    document.getElementById('longitud').value = '';
    document.getElementById('diaDelMes').value = 15;
    
    // Limpia resultados
    document.getElementById('resultado-mensual').innerHTML = '';
    document.getElementById('resultado-anual').innerHTML = '';
    document.getElementById('resultado-baterias').innerHTML = '';
    document.getElementById('resultado-regulador').innerHTML = '';
    document.getElementById('resultado-inversor').innerHTML = '';
    document.getElementById('resultado-cableado').innerHTML = '';
    document.getElementById('pais-resultado').innerHTML = '';
    
    // Limpia inputs de dimensionamiento
    const dimensionInputs = [
        'input-pp', 'input-pg', 'input-vbat', 'input-vp', 'input-autonomia', 
        'input-pd', 'input-longitud-cable', 'input-seccion-cable', 'input-resistividad',
        'input-et', 'input-hps' // Nuevos inputs automáticos
    ];
    dimensionInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Destruir el gráfico
    if (radiacionChart) radiacionChart.destroy();
    
    // Limpiar la tabla de consumo (función a definir/importar)
    window.limpiarTablaConsumo && window.limpiarTablaConsumo(); 

    // Resetear el cálculo de consumo
    calcularConsumoTotal();
    ET_Global_Wh = 0;
}


// =================================================================================
// === FUNCIÓN MAESTRA: ejecutarCalculos (ORQUESTACIÓN) ===
// =================================================================================

async function ejecutarCalculos() {
    
    document.getElementById('loading-spinner').style.display = 'block';
    document.getElementById('resultado-anual').innerHTML = ''; 

    const ET_requerida = ET_Global_Wh; 
    
    // Si ET es cero, solo calculamos el generador con los inputs disponibles (que dará 0 si no hay HSP)
    if (ET_requerida <= 0) {
        document.getElementById('loading-spinner').style.display = 'none';
        // mostrarMensaje('Advertencia', 'El consumo total diario (ET) es cero o no válido.', 'warning');
        if (radiacionChart) radiacionChart.destroy(); 
        
        document.getElementById('resultado-baterias').innerHTML = '';
        document.getElementById('resultado-regulador').innerHTML = ''; 
        document.getElementById('resultado-inversor').innerHTML = ''; 
        document.getElementById('resultado-cableado').innerHTML = ''; 
        
        // Llamamos a las funciones finales para que muestren la validación de 'datos insuficientes'
        calcularNumeroPaneles(); 
        calcularCapacidadBaterias(); 
        calcularCorrienteReguladorFinal(); 
        calcularInversorFinal();
        calcularCableadoFinal();
        return; 
    }
    
    const latitudGrados = parseFloat(document.getElementById('latitud').value);
    const longitudGrados = parseFloat(document.getElementById('longitud').value);
    const diaDelMes = parseInt(document.getElementById('diaDelMes').value);
    
    if (isNaN(latitudGrados) || isNaN(longitudGrados) || isNaN(diaDelMes)) {
        document.getElementById('loading-spinner').style.display = 'none';
        mostrarMensaje('Error', "Por favor, introduce valores válidos en Latitud, Longitud y Día.", 'error');
        if (radiacionChart) radiacionChart.destroy();
        return;
    }

    const orientacionAzimut = latitudGrados >= 0 ? 0 : 180; 

    document.getElementById('pais-resultado').innerHTML = "<span class='text-blue-500'>Buscando país y calculando irradiancia óptima...</span>";
    const nombrePais = await obtenerPaisPorCoordenadas(latitudGrados, longitudGrados);
    document.getElementById('pais-resultado').innerHTML = `País: 🗺️ **${nombrePais}**`;
    
    // === LLAMADA AL MÓDULO DE RADIACIÓN CENTRAL ===
    const { 
        anguloOptimo, 
        GiMinMensual, 
        GiAnualMWh,
        resultadosMensuales: resultadosOptimados 
    } = await calcularRadiacionOptima(latitudGrados, longitudGrados, diaDelMes);
    
    resultadosMensualesGlobales = resultadosOptimados;

    // Actualizar Azimut e Inclinación óptima en la UI
    const inclinacionGradosDefault = Math.abs(latitudGrados); 
    document.getElementById('inclinacion-display').textContent = anguloOptimo !== null ? anguloOptimo.toFixed(1) : inclinacionGradosDefault.toFixed(1) + ' (Fallo)';

    if (anguloOptimo !== null) {
        const inputInclinacion = document.getElementById('input-inclinacion');
        if(inputInclinacion) inputInclinacion.value = anguloOptimo.toFixed(1);
        const inputAzimut = document.getElementById('input-azimut');
        if(inputAzimut) inputAzimut.value = orientacionAzimut.toFixed(0); 
    }
    
    // Generar Tabla Mensual y Resumen Anual
    if (anguloOptimo !== null) {
        const latitudRadianes = latitudGrados / RAD_A_DEG;
        const inclinacionRadianesOptima = anguloOptimo / RAD_A_DEG;
        generarTablaMensual(resultadosOptimados, inclinacionRadianesOptima, anguloOptimo, latitudRadianes);
        generarTablaAnualResumen(anguloOptimo, GiMinMensual, GiAnualMWh);
    } else {
        document.getElementById('resultado-mensual').innerHTML = `<p class='text-center text-red-600 font-semibold'>No se pudo calcular la Irradiancia (HSP).</p>`;
        document.getElementById('resultado-anual').innerHTML = `<p class='text-center text-red-600 font-semibold'>No se pudo obtener la Irradiancia (HSP) para dimensionar el generador.</p>`;
    }

    actualizarGrafico(resultadosOptimados, anguloOptimo); 

    // === 6. Dimensionamiento Final del Generador, Baterías y Regulador ===
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
                <p class="text-lg mt-2">Ángulo Óptimo de Inclinación β: <strong class="text-green-600">${anguloOptimo.toFixed(1)}°</strong></p>
                <p class="text-lg">HSP Mínima (Mes Desfavorable): <strong class="text-red-600">${GiMinMensual.toFixed(2)} kWh/m² día</strong></p>
                <p class="text-xl mt-3 font-extrabold text-blue-800">Potencia Pico Requerida P<sub>p</sub>: 
                    <span class="resaltado-resultado">${PpicoRequerida.toFixed(2)} Wp</span>
                </p>
                <p class="text-sm text-gray-600 mt-2">(*Asumiendo un **Factor de Pérdidas del Sistema (PR)** $C_p=${Cp_valor_estandar.toFixed(1)}$$)</p>
            </div>
        `;
        document.getElementById('resultado-anual').insertAdjacentHTML('beforeend', resumenDimensionamientoHTML);
        
        // LLAMADAS FINALES DE DIMENSIONAMIENTO 
        // Estas funciones dependen de los inputs automáticos (ET, HPS) y manuales (Pp, Vbat, Vp, etc.)
        calcularNumeroPaneles(); 
        calcularCapacidadBaterias(); 
        calcularCorrienteReguladorFinal(); 
        calcularInversorFinal();
        
    } else {
        document.getElementById('resultado-anual').innerHTML = `<p class='text-center text-red-600 font-semibold'>No se pudo obtener la Irradiancia (HSP) para dimensionar el generador.</p>`;
        document.getElementById('resultado-baterias').innerHTML = ''; 
        document.getElementById('resultado-regulador').innerHTML = ''; 
        document.getElementById('resultado-inversor').innerHTML = '';
        document.getElementById('resultado-cableado').innerHTML = '';
        calcularNumeroPaneles(); // Llamada para validar/limpiar la sección de paneles
    }

    document.getElementById('loading-spinner').style.display = 'none';

}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE PANELES Y MATRIZ ===
// =========================================================================

/**
 * Calcula y muestra el Número de Paneles (Nt), Paneles en Serie (Ns) y Ramas en Paralelo (Np).
 */
function calcularNumeroPaneles() { 
    // Entradas
    const Et_kwh = parseFloat(document.getElementById('input-et').value) || 0; 
    const ET_requeridaWh = Et_kwh * 1000;
    const HPS_kwh = parseFloat(document.getElementById('input-hps').value) || 0; 
    const Pp_Wp = parseFloat(document.getElementById('input-pp').value) || 0; 
    const Pg = parseFloat(document.getElementById('input-pg').value) || 0.8; 
    
    // Voltajes
    const V_BAT = parseFloat(document.getElementById('input-vbat').value) || 0;
    const Vp = parseFloat(document.getElementById('input-vp').value) || 0; 
    
    const resultadoElement = document.getElementById('resultado-matriz');
    resultadoElement.innerHTML = '';
    
    if (ET_requeridaWh <= 0 || HPS_kwh <= 0 || Pp_Wp <= 0 || Pg <= 0 || V_BAT <= 0 || Vp <= 0) {
        resultadoElement.innerHTML = `<p class="text-sm text-red-600 font-bold">Revise datos de Consumo (Et/HPS), Panel (Pp/Vp) y Batería (Vbat).</p>`;
        // También llamamos al regulador para que valide sus entradas y muestre mensaje de error.
        calcularCorrienteReguladorFinal(); 
        return;
    }

    // 1. CÁLCULO DE NÚMERO TOTAL DE PANELES (Nt)
    const Nt_total = Math.ceil(calcularNumeroTotalPaneles(ET_requeridaWh, HPS_kwh, Pp_Wp, Pg));
    
    // 2. CÁLCULO DE PANELES EN SERIE (Ns)
    const Ns = calcularPanelesEnSerie(V_BAT, Vp);

    // 3. CÁLCULO DE RAMAS EN PARALELO (Np)
    const Np = calcularRamasEnParalelo(Nt_total, Ns);

    const Nt_final = Ns * Np;
    const panelesDisplay = document.getElementById('resultado-paneles');
    if (panelesDisplay) {
        panelesDisplay.textContent = Nt_final > 0 ? Nt_final.toString() : '0';
    }
    const Pp_real = (Nt_final * Pp_Wp).toFixed(2);
    const Ep_generada = (Nt_final * Pp_Wp * HPS_kwh * Pg / 1000).toFixed(2); // kWh/día

    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-blue-400 bg-blue-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">Dimensionamiento de la Matriz Solar</h3>
            
            <p class="text-lg mt-2">Número de Paneles en **Serie (N<sub>s</sub>)**: <strong class="text-blue-600">${Ns} paneles</strong></p>
            <p class="text-lg">Número de **Ramas en Paralelo (N<sub>p</sub>)**: <strong id="input-np-final" class="text-blue-600">${Np} ramas</strong></p>
            
            <p class="text-xl mt-3 font-extrabold text-teal-800">Paneles Totales Necesarios N<sub>t</sub>: 
                <span class="resaltado-resultado">${Nt_final} Paneles</span>
            </p>
            <p class="text-lg mt-1">Potencia Real Instalada: <strong>${Pp_real} Wp</strong></p>
            <p class="text-lg">Energía Diaria Generada Estimada: <strong>${Ep_generada} kWh/día</strong></p>
            
            <p class="text-sm text-gray-600 mt-2">(*Se considera un arreglo de ${Ns} paneles en serie, repetido ${Np} veces en paralelo.)</p>
        </div>
    `;
    
    // Ejecutar el cálculo del regulador y cableado, ya que Np se ha actualizado
    calcularCorrienteReguladorFinal(); 
}


// =========================================================================
// === FUNCIÓN DE CÁLCULO DE BATERÍAS ===
// =========================================================================

function calcularCapacidadBaterias() { 
    const consumoDiarioKWh = parseFloat(document.getElementById('input-et').value || 0);
    const ET_requeridaWh = consumoDiarioKWh * 1000;
    
    const D_dias = parseFloat(document.getElementById('input-autonomia').value) || 2; 
    const Vbat_voltios = parseFloat(document.getElementById('input-vbat').value);
    const Pd_descarga = parseFloat(document.getElementById('input-pd').value) || 0.5; 
    
    const resultadoElement = document.getElementById('resultado-baterias');
    resultadoElement.innerHTML = '';
    
    if (ET_requeridaWh <= 0 || isNaN(D_dias) || D_dias <= 0 || isNaN(Vbat_voltios) || Vbat_voltios <= 0 || isNaN(Pd_descarga) || Pd_descarga <= 0 || Pd_descarga > 1) {
        resultadoElement.innerHTML = `<p class="text-sm text-red-600 font-bold">Revise los datos de Consumo (Et), Autonomía (D), Voltaje de Batería (Vbat) y Profundidad de Descarga (Pd).</p>`;
        return;
    }
    const Cn_Ah = calcularCapacidadNominalBateria(ET_requeridaWh, D_dias, Vbat_voltios, Pd_descarga);

    const energiaAutonomiaWh = D_dias * ET_requeridaWh;
    const energiaAutonomiaKWh = (energiaAutonomiaWh / 1000).toFixed(2);

    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-teal-400 bg-teal-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">Dimensionamiento del Banco de Baterías</h3>
            <p class="text-lg mt-2">Días de Autonomía Requeridos: <strong>${D_dias} días</strong></p>
            <p class="text-lg">Energía de Autonomía : <strong class="text-teal-600">${energiaAutonomiaKWh} kWh</strong></p>
            <p class="text-lg">Profundidad de Descarga Máxima P<sub>d</sub>: <strong>${(Pd_descarga * 100).toFixed(0)}%</strong></p>
            <p class="text-xl mt-3 font-extrabold text-blue-800">Capacidad Nominal Requerida C<sub>n</sub>: 
                <span class="resaltado-resultado">${Cn_Ah} Ah</span>
            </p>
            <p class="text-sm text-gray-600 mt-2">(*Capacidad mínima requerida a ${Vbat_voltios}V.)</p>
        </div>
    `;
    calcularCorrienteReguladorFinal(); 
    calcularInversorFinal();
}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE REGULADOR ===
// =========================================================================

function calcularCorrienteReguladorFinal() {
    
    // 1. Obtener datos de Generador 
    const Pp_Wp = parseFloat(document.getElementById('input-pp').value) || 0; // Potencia del panel
    const VpmpP = parseFloat(document.getElementById('input-vp').value) || 0; // Usamos Vp como proxy de VpmpP

    let Np = parseFloat(document.getElementById('input-np-final')?.textContent) || 0; 
    
    // 2. Obtener datos de Consumo (PDC y PAC)
    const { Pdc_W, Pac_W } = obtenerPotenciaInstantaneaTotal(); 
    
    const V_BAT = parseFloat(document.getElementById('input-vbat').value) || 0;
    const Vbat_voltios = V_BAT;
    const resultadoElement = document.getElementById('resultado-regulador'); 

    if (!resultadoElement) return;
    resultadoElement.innerHTML = '';

    // 3. Validación Mínima 
    if (Np <= 0 || Vbat_voltios <= 0 || Pp_Wp <= 0 || VpmpP <= 0) {
        resultadoElement.innerHTML = `<p class="text-sm text-red-600 font-bold">Inicie el cálculo del generador (Matriz solar) y defina V<sub>bat</sub>.</p>`;
        calcularCableadoFinal(); // Llamada para que cableado valide sus entradas también
        return;
    }
    
    // 4. CÁLCULO DE CORRIENTES
    
    // Corriente Generada (IG)
    const IG = calcularCorrienteGenerada(Pp_Wp, VpmpP, Np); // Fórmula: $I_G = N_p \cdot (P_p / V_p)$
    
    // Corriente Consumida (IC) 
    const IC = calcularCorrienteConsumida(Pdc_W, Vbat_voltios, Pac_W); // $I_C = (P_{dc} + P_{ac} / \eta_{inv}) / V_{bat}$

    // Corriente del Regulador (IR)
    const IR_final = calcularCorrienteRegulador(IG, IC); // Máximo($I_G, I_C$) * 1.25 y redondeo.
    
    // 5. Visualización de Resultados
    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-orange-400 bg-orange-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">⚡ Dimensionamiento del Regulador de Carga</h3>
            <div class="grid grid-cols-3 gap-4 mt-2 text-center">
                <div class="p-2 bg-orange-200 rounded">
                    <p class="text-sm text-orange-800">Corriente Generada I<sub>G</sub></p>
                    <p class="text-lg font-bold text-red-700" id="input-ig-final">${IG.toFixed(2)} A</p>
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
    
    calcularCableadoFinal();
}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE INVERSOR ===
// =========================================================================

function calcularInversorFinal() {
    // 1. Obtener entradas
    const V_BAT = parseFloat(document.getElementById('input-vbat')?.value) || 0;
    
    // Obtener la potencia AC total de la tabla de consumo
    const { Pdc_W, Pac_W } = obtenerPotenciaInstantaneaTotal();

    const resultadoDiv = document.getElementById('resultado-inversor');
    if (!resultadoDiv) return;

    // Verificar datos
    if (V_BAT <= 0 || Pac_W <= 0) {
        resultadoDiv.innerHTML = `<p class="text-gray-500 font-semibold text-center">Ingrese el Voltaje de Batería y registre cargas AC.</p>`;
        return;
    }

    // 2. Calcular la potencia nominal mínima requerida
    const FACTOR_SEGURIDAD = 1.25; // 25% de margen
    const P_nominal_W = calcularInversorNominal(Pac_W, FACTOR_SEGURIDAD);

    const P_nominal_kW = P_nominal_W / 1000;
    
    // 3. Mostrar resultados
    resultadoDiv.innerHTML = `
        <div class="mt-4 p-6 border-4 border-blue-400 bg-blue-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">Dimensionamiento del Inversor</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div class="p-3 bg-white rounded-lg shadow-sm border border-blue-200">
                    <p class="text-xs font-medium text-blue-600">Potencia Máxima AC (P<sub>AC</sub>)</p>
                    <p class="text-xl font-bold text-blue-800">${Pac_W.toFixed(2)} W</p>
                </div>
                <div class="p-3 bg-blue-200 rounded-lg shadow-md border border-blue-400">
                    <p class="text-sm font-medium text-blue-800">Potencia Nominal Mínima</p>
                    <p class="text-2xl font-extrabold text-blue-900">${P_nominal_W.toFixed(0)} W</p>
                    <p class="text-sm font-bold text-blue-700">(${P_nominal_kW.toFixed(2)} kW)</p>
                </div>
                <div class="p-3 bg-white rounded-lg shadow-sm border border-blue-200">
                    <p class="text-xs font-medium text-blue-600">Tensión de Entrada</p>
                    <p class="text-xl font-bold text-blue-800">${V_BAT} V</p>
                </div>
            </div>
            <p class="mt-4 text-sm text-gray-600 text-center">
                (Incluye ${((FACTOR_SEGURIDAD - 1) * 100).toFixed(0)}% de margen de seguridad.)
            </p>
        </div>
    `;
}

// =========================================================================
// === FUNCIÓN DE CÁLCULO DE CABLEADO ===
// =========================================================================

function calcularCableadoFinal() {
    // 1. Obtener entradas
    // I_dc debe ser la Corriente Generada (IG)
    const IG_A = parseFloat(document.getElementById('input-ig-final')?.textContent) || 0; 
    const L_ida_m = parseFloat(document.getElementById('input-longitud-cable')?.value) || 5; 
    const S_seccion_mm2 = parseFloat(document.getElementById('input-seccion-cable')?.value) || 4; 
    const RHO_Cobre = parseFloat(document.getElementById('input-resistividad')?.value) || 0.0172; 
    const Vbat_voltios = parseFloat(document.getElementById('input-vbat')?.value) || 12;

    const resultadoElement = document.getElementById('resultado-cableado');
    if (!resultadoElement) return;

    let I_dc = IG_A; 

    if (I_dc <= 0 || L_ida_m <= 0 || S_seccion_mm2 <= 0 || RHO_Cobre <= 0) {
        resultadoElement.innerHTML = `<p class="text-gray-500 font-semibold text-center">Ingrese Longitud, Sección y una Corriente de Diseño válida (I<sub>G</sub>).</p>`;
        return;
    }

    // 3. CÁLCULO DE PÉRDIDAS
    // $R_c = \frac{2 \cdot \rho \cdot L}{S}$ y $P_r = I_{dc}^2 \cdot R_c$
    const { Rc, Pr } = calcularPerdidasJoule(I_dc, L_ida_m, S_seccion_mm2, RHO_Cobre);

    // 4. Cálculo de la Caída de Tensión
    const DeltaV = I_dc * Rc; // $\Delta V = I_{dc} \cdot R_c$
    const V_inicial = Vbat_voltios;
    
    const PerdidaRelativa_pct = (DeltaV / V_inicial) * 100;

    // 5. Visualización de Resultados
    resultadoElement.innerHTML = `
        <div class="mt-4 p-6 border-4 border-yellow-400 bg-yellow-100 rounded-lg w-full">
            <h3 class="text-xl font-bold text-gray-800">Dimensionamiento del Cableado DC</h3>
            <p class="text-lg">Corriente de Diseño: <strong>${I_dc.toFixed(2)} A</strong></p>
            <p class="text-lg">Longitud total: <strong>${(L_ida_m * 2).toFixed(2)} m</strong></p>
            <p class="text-lg">Sección del Conductor S: <strong>${S_seccion_mm2.toFixed(1)} mm²</strong></p>
            
            <div class="grid grid-cols-2 gap-4 mt-3 text-center">
                <div class="p-2 bg-yellow-200 rounded">
                    <p class="text-sm text-yellow-800">Resistencia Óhmica R<sub>C</sub></p>
                    <p class="text-lg font-bold text-gray-800">${Rc.toFixed(4)}Ω</p>
                </div>
                <div class="p-2 bg-yellow-200 rounded">
                    <p class="text-sm text-yellow-800">Potencia Perdida P<sub>R</sub> (Joule)</p>
                    <p class="text-xl font-extrabold text-red-700">${Pr.toFixed(2)} W</p>
                </div>
            </div>
            
            <h4 class="text-base font-bold mt-4 text-gray-800">Caída de Tensión y Eficiencia</h4>
            <p class="text-lg">Caída de Tensión: <strong class="text-red-700">${DeltaV.toFixed(2)} V</strong></p>
            <p class="text-lg">Pérdida Relativa: 
                <strong class="${PerdidaRelativa_pct > 3 ? 'text-red-700 font-extrabold' : 'text-green-700'}">
                    ${PerdidaRelativa_pct.toFixed(2)} %
                </strong> 
                <span class="text-xs text-gray-600">(Máximo recomendado: 3%)</span>
            </p>
        </div>
    `;
}

// =========================================================================
// === ORQUESTACIÓN Y LISTENERS ===
// =========================================================================

/**
 * Función que maneja el cambio de consumo (callback) y dispara los cálculos principales.
 * @param {number} newET_Wh Nuevo valor de la Energía Total diaria en Wh/día.
 */
function handleConsumptionChange(newET_Wh) { 
    ET_Global_Wh = newET_Wh;
    
    // Si el consumo cambia, re-ejecutamos todo el ciclo de cálculo
    ejecutarCalculos(); 

    // NOTA: Se eliminan las llamadas duplicadas a las funciones de dimensionamiento
    // ya que ejecutarCalculos() las llama internamente.
}


// Event Listeners y Configuración Inicial
document.addEventListener('DOMContentLoaded', () => {
    // 1. Enlazar el callback del consumo
    setConsumptionChangeCallback(handleConsumptionChange); 
    
    // 2. Ejecutar cálculos principales al hacer clic en el botón (Geografía)
    const btnCalcular = document.getElementById('calcular-btn') || document.getElementById('btn-calcular');
    if (btnCalcular) btnCalcular.addEventListener('click', ejecutarCalculos);
    
    // 3. Re-ejecutar cálculos principales si cambian los datos de Geografía
    document.getElementById('latitud')?.addEventListener('input', ejecutarCalculos);
    document.getElementById('longitud')?.addEventListener('input', ejecutarCalculos);
    document.getElementById('diaDelMes')?.addEventListener('input', ejecutarCalculos);

    // 4. Re-ejecutar cálculos de matriz, batería y regulador si cambian los inputs relacionados
    document.getElementById('input-pp')?.addEventListener('input', calcularNumeroPaneles);
    document.getElementById('input-pg')?.addEventListener('input', calcularNumeroPaneles);
    
    // Listeners para las fórmulas de matriz y batería (que solo dependen de su sección)
    document.getElementById('input-vbat')?.addEventListener('input', () => {
        calcularNumeroPaneles(); // Ns depende de Vbat
        calcularCapacidadBaterias(); // Cn depende de Vbat
        calcularCorrienteReguladorFinal(); // IR depende de Vbat
        calcularInversorFinal(); // Inversor depende de Vbat
    });
    document.getElementById('input-vp')?.addEventListener('input', calcularNumeroPaneles);
    
    // Listener para los datos de Batería y Regulador
    document.getElementById('input-autonomia')?.addEventListener('input', calcularCapacidadBaterias);
    document.getElementById('input-pd')?.addEventListener('input', calcularCapacidadBaterias);

    // 5. Re-ejecutar cálculo de Cableado (Solo cableado, ya que IG depende del regulador)
    const cableadoInputs = ['input-longitud-cable', 'input-seccion-cable', 'input-resistividad'];
    cableadoInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calcularCableadoFinal);
            element.addEventListener('change', calcularCableadoFinal);
        }
    });
    
    // 6. Configurar botón de limpieza
    document.getElementById('limpiar-btn')?.addEventListener('click', limpiarFormulario);

    // Iniciar con la tabla de consumo
    agregarFilaConsumo(); 
    calcularConsumoTotal();
});


// =========================================================================
// === EXPOSICIÓN DE FUNCIONES GLOBALES (Para uso en HTML) ===
// =========================================================================

window.agregarFilaConsumo = agregarFilaConsumo;
window.eliminarFila = eliminarFila;
window.calcularConsumoTotal = calcularConsumoTotal; 
window.obtenerPotenciaInstantaneaTotal = obtenerPotenciaInstantaneaTotal;
window.ejecutarCalculos = ejecutarCalculos;
window.limpiarFormulario = limpiarFormulario;
window.calcularNumeroPaneles = calcularNumeroPaneles;
window.calcularCapacidadBaterias = calcularCapacidadBaterias;
window.calcularCorrienteReguladorFinal = calcularCorrienteReguladorFinal;
window.calcularInversorFinal = calcularInversorFinal;
window.calcularCableadoFinal = calcularCableadoFinal;