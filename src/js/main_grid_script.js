/**
 * main_grid_script.js
 * Script principal para la página de cálculo de sistemas On-Grid (red.html).
 * Estado: Actualizado con soporte para Sección de Cable AC y Caída de Tensión.
 */

// === Importaciones de Módulos ===
import { calcularRadiacionOptima } from './solar_radiation_core.js'; 

import { 
    calcularPotenciaPico, 
    calcularNumeroModulos, 
    dimensionarInversor 
} from './solar_grid_formulas.js'; 


document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener referencias a elementos clave del DOM
    const formGrid = document.getElementById('grid-calculation-form');
    const resultsDiv = document.getElementById('grid-results');
    
    // === REFERENCIAS DE LA TABLA DE CONSUMO ===
    const addDeviceBtn = document.getElementById('add-device-btn');
    const devicesContainerHook = document.getElementById('devices-container-hook');
    const deviceTemplate = document.getElementById('device-template');
    const consumoAnualInput = document.getElementById('consumo-anual');
    
    // Referencia al botón de submit para el Plan B de escucha directa
    const calculateButton = document.querySelector('#grid-calculation-form button[type="submit"]');

    // 2. Escuchar el evento de envío del formulario
    if (formGrid) {
        formGrid.addEventListener('submit', handleGridCalculation);
    }
    // Plan B: Enlazar al click directo del botón por si el submit falla
    if (calculateButton) {
        calculateButton.addEventListener('click', handleGridCalculation);
    }

    // =========================================================================
    // A. LÓGICA DE CONSUMO Y DISPOSITIVOS (Funcionalidad Dinámica de la Tabla)
    // =========================================================================

    // Ocultar la plantilla de dispositivo
    if (deviceTemplate) {
        deviceTemplate.style.display = 'none';
        addNewDeviceRow(true); 
    }
    
    // Listener para añadir nueva fila
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', () => addNewDeviceRow(false));
    }
    
    function addNewDeviceRow(isInitialRow) {
        if (!deviceTemplate || !devicesContainerHook) return;

        const newRow = deviceTemplate.cloneNode(true);
        newRow.id = ''; 
        newRow.style.display = 'grid'; 

        // Limpiar valores (Incluyendo el nuevo selector AC/DC)
        if (!isInitialRow) {
            newRow.querySelector('.device-name').value = '';
            const typeSelect = newRow.querySelector('.device-type');
            if (typeSelect) typeSelect.value = 'AC';
            
            newRow.querySelector('.device-power').value = '';
            newRow.querySelector('.device-qty').value = '1';
            newRow.querySelector('.device-hours').value = '';
        }

        // Asignar listener para eliminar
        newRow.querySelector('.remove-device').addEventListener('click', function() {
            if (devicesContainerHook.children.length > 1) {
                newRow.remove();
                calcularConsumoAnualTotal(); 
            } else {
                alert("Debe haber al menos un dispositivo.");
            }
        });

        // Asignar listeners para recalcular el consumo cuando cambie cualquier input
        const inputs = newRow.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', calcularConsumoAnualTotal);
        });

        devicesContainerHook.appendChild(newRow);
        calcularConsumoAnualTotal(); 
    }

    function calcularConsumoAnualTotal() {
        const rows = devicesContainerHook.querySelectorAll('.device-row[style*="display: grid"]');
        let consumoDiarioTotal_Wh = 0;

        rows.forEach(row => {
            const power = parseFloat(row.querySelector('.device-power')?.value) || 0;
            const qty = parseFloat(row.querySelector('.device-qty')?.value) || 0;
            const hours = parseFloat(row.querySelector('.device-hours')?.value) || 0;

            if (power > 0 && qty > 0 && hours >= 0) {
                const consumoDispositivo = power * qty * hours;
                consumoDiarioTotal_Wh += consumoDispositivo;
            }
        });

        const consumoAnual_kWh = (consumoDiarioTotal_Wh * 365) / 1000;
        
        if (consumoAnualInput) {
            consumoAnualInput.value = consumoAnual_kWh.toFixed(2);
        }
        
        return consumoAnual_kWh;
    }

    // =========================================================================
    // B. LÓGICA PRINCIPAL DE CÁLCULO (handleGridCalculation)
    // =========================================================================

    async function handleGridCalculation(e) {
        e.preventDefault(); 
        
        const consumoAnual_kWh = calcularConsumoAnualTotal(); 
        const rendimientoSistema = parseFloat(document.getElementById('rendimiento-sistema').value);
        const potenciaModulo_Wp = parseFloat(document.getElementById('potencia-modulo').value); 
        
        const latitudGrados = parseFloat(document.getElementById('latitud-grid').value);
        const longitudGrados = parseFloat(document.getElementById('longitud-grid').value);
        const diaDelMes = 15; 

        // Nuevos campos de Interconexión IEEE 1547
        const voltajeRed = parseFloat(document.getElementById('voltaje-red').value) || 120;
        const distanciaAC = parseFloat(document.getElementById('distancia-ac').value) || 10;
        const caidaMaxPorcentaje = parseFloat(document.getElementById('caida-tension-max').value) || 2;

        let HSP_anual = parseFloat(document.getElementById('hsp-anual').value); 
        let anguloOptimo = 0;

        if (isNaN(latitudGrados) || isNaN(longitudGrados)) {
            if (HSP_anual <= 0) {
                 mostrarError(resultsDiv, 'Ingrese coordenadas geográficas o un valor de HSP Anual válido.');
                 return;
            }
        } else {
            try {
                resultsDiv.innerHTML = '<p style="color: yellow;">Calculando el ángulo óptimo y el HSP Anual con su geolocalización...</p>';
                
                const { 
                    anguloOptimo: coreAnguloOptimo, 
                    GiAnualMWh, 
                } = await calcularRadiacionOptima(latitudGrados, longitudGrados, diaDelMes);
                
                HSP_anual = GiAnualMWh * 1000; 
                anguloOptimo = coreAnguloOptimo;
                
                document.getElementById('hsp-anual').value = HSP_anual.toFixed(2);
                document.getElementById('inclinacion-grid').value = anguloOptimo.toFixed(1);
                resultsDiv.innerHTML = ''; 

            } catch (error) {
                console.error("Error en el cálculo del Core:", error);
                mostrarError(resultsDiv, 'Error al obtener el HSP de la API o cálculo. Intente con un valor manual.');
                HSP_anual = 0;
            }
        }
        
        if (consumoAnual_kWh <= 0 || HSP_anual <= 0 || rendimientoSistema <= 0 || potenciaModulo_Wp <= 0) {
             mostrarError(resultsDiv, 'Por favor, asegúrate que todos los valores sean válidos.');
             return;
        }

        const factorRendimiento = rendimientoSistema > 1 ? rendimientoSistema / 100 : rendimientoSistema;

        try {
            const potenciaPico_kWp = calcularPotenciaPico(consumoAnual_kWh, HSP_anual, factorRendimiento);
            const numModulos = calcularNumeroModulos(potenciaPico_kWp, potenciaModulo_Wp);
            const potenciaInversor_kW = dimensionarInversor(potenciaPico_kWp);

            const hspDiario = HSP_anual / 365;

            // Lógica IEEE 1547: Corriente de Interconexión
            const corrienteAC = (potenciaInversor_kW * 1000) / voltajeRed;
            const breakerCalculado = Math.ceil(corrienteAC * 1.25);
            
            const breakersComerciales = [15, 20, 25, 30, 40, 50, 60, 70, 80, 100];
            const breakerSugerido = breakersComerciales.find(b => b >= breakerCalculado) || breakerCalculado;

            // --- CÁLCULO DE CAÍDA DE TENSIÓN Y CABLE ---
            // Resistividad Cobre (rho) = 0.0172 Ohm*mm2/m
            const rho = 0.0172;
            const deltaV_permitido = (caidaMaxPorcentaje / 100) * voltajeRed;
            // Fórmula Sección S = (2 * L * I * rho) / deltaV
            const seccionCalculada = (2 * distanciaAC * corrienteAC * rho) / deltaV_permitido;

            mostrarResultados({
                potenciaPico_kWp,
                numModulos,
                potenciaInversor_kW,
                potenciaModulo_Wp,
                anguloOptimo,
                voltajeRed,
                corrienteAC,
                breakerSugerido,
                distanciaAC,
                hspDiario,
                HSP_anual,
                seccionCalculada
            });

        } catch (error) {
            console.error("Error en el cálculo:", error);
            mostrarError(resultsDiv, 'Ocurrió un error al calcular el sistema.');
        }
    }

    // =========================================================================
    // C. FUNCIONES AUXILIARES
    // =========================================================================
    
    function mostrarResultados(data) {
        resultsDiv.innerHTML = `
            <h3>Resultados del Dimensionamiento Conectado a Red</h3>
            <table style="width: 100%; text-align: left;">
                <tr>
                    <td><strong>HSP Diario Promedio:</strong></td>
                    <td><span style="color: #00ffff;">${data.hspDiario.toFixed(2)} h/día</span></td>
                </tr>
                <tr>
                    <td><strong>Irradiación Total Anual:</strong></td>
                    <td><span>${data.HSP_anual.toFixed(2)} kWh/m²/año</span></td>
                </tr>
                <tr><td colspan="2"><hr style="border-color: #444;"></td></tr>
                <tr>
                    <td><strong>Potencia Pico Requerida:</strong></td>
                    <td><strong id="resultado-ppico" style="color: #00ff00;">${data.potenciaPico_kWp.toFixed(2)}</strong> <span style="color: #00ff00;">kWp</span></td>
                </tr>
                <tr>
                    <td><strong>Número de Módulos (usando ${data.potenciaModulo_Wp} Wp):</strong></td>
                    <td><strong id="resultado-nmodulos" style="color: #00ff00;">${data.numModulos}</strong> <span style="color: #00ff00;">unidades</span></td>
                </tr>
                <tr>
                    <td><strong>Potencia Total Instalada:</strong></td>
                    <td><span id="resultado-ptotal">${(data.numModulos * data.potenciaModulo_Wp / 1000).toFixed(2)}</span> kWp</td>
                </tr>
                <tr><td colspan="2"><hr style="border-color: #555;"></td></tr>
                <tr>
                    <td><strong>Ángulo de Inclinación Óptimo:</strong></td>
                    <td>${data.anguloOptimo.toFixed(1)} °</td>
                </tr>
                <tr>
                    <td><strong>Potencia Mínima del Inversor (AC):</strong></td>
                    <td><strong id="resultado-pinversor" style="color: #00ff00;">${data.potenciaInversor_kW.toFixed(2)}</strong> <span style="color: #00ff00;">kW</span></td>
                </tr>
                <tr><td colspan="2"><hr style="border-color: #555;"></td></tr>
                <tr style="background-color: #2d2d2d;">
                    <td><strong>Protección AC (Breaker) IEEE 1547:</strong></td>
                    <td><strong id="resultado-breaker" style="color: #ff9900;">${data.breakerSugerido} A</strong></td>
                </tr>
                <tr style="background-color: #2d2d2d;">
                    <td><strong>Sección de Cable AC Mínima:</strong></td>
                    <td><strong id="resultado-cable-ac" style="color: #ff9900;">${data.seccionCalculada.toFixed(2)} mm²</strong></td>
                </tr>
                <tr>
                    <td><strong>Voltaje de Interconexión:</strong></td>
                    <td>${data.voltajeRed} VAC</td>
                </tr>
            </table>

            <p class="note" style="font-size: 0.9em; color: #aaaaaa; margin-top: 15px;">
                * El breaker sugerido incluye el factor de seguridad del 125% para cargas continuas.<br>
                * El cálculo de cable garantiza que la caída de tensión sea inferior al seleccionado.<br>
                * El sistema debe contar con protección Anti-Isla activa según norma IEEE 1547.
            </p>
        `;
        resultsDiv.classList.remove('error');
        resultsDiv.classList.add('success');
    }

    function mostrarError(element, mensaje) {
        element.innerHTML = `<p style="color: red;">❌ ERROR: ${mensaje}</p>`;
        element.classList.remove('success');
        element.classList.add('error');
    }
});