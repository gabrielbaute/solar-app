/**
 * @fileoverview Funciones para la gestión de la tabla de consumo y el cálculo de la Energía Total (ET),
 * incluyendo la extracción de la Potencia Instantánea para el dimensionamiento del Regulador.
 */

 import { mostrarMensaje } from './main.js';

 // Variable global para almacenar la función de callback de main_script.
 let onConsumptionChangeCallback = null;
 
 // =================================================================================
 // === FUNCIONES DE CONFIGURACIÓN Y CONSUMO
 // =================================================================================
 
 /**
  * Establece la función que será llamada en main_script.js cuando el consumo cambie.
  * @param {Function} callback La función a llamar, que recibe el ET (Wh/día).
  */
 export function setConsumptionChangeCallback(callback) {
     onConsumptionChangeCallback = callback;
 }
 
 /**
  * Agrega una nueva fila a la tabla de consumo.
  */
 export function agregarFilaConsumo() {
     const cuerpoTabla = document.getElementById('cuerpo-tabla-consumo');
     const newRow = cuerpoTabla.insertRow();
     
     // Crear el HTML para la fila
     newRow.innerHTML = `
         <td class="px-3 py-2 whitespace-nowrap">
             <select name="tipo" class="p-1 border rounded text-sm w-full" onchange="window.calcularConsumoTotal()">
                 <option value="AC">AC</option>
                 <option value="DC">DC</option>
             </select>
         </td>
         <td class="px-3 py-2 whitespace-nowrap">
             <input type="text" name="nombre" placeholder="Ej: Nevera, bombillo" class="p-1 border rounded text-sm w-full">
         </td>
         <td class="px-3 py-2 whitespace-nowrap">
             <input type="number" name="potencia" value="0" min="0" step="any" class="p-1 border rounded text-sm w-full" oninput="window.calcularConsumoTotal(); window.calcularCorrienteReguladorFinal()">
         </td>
         <td class="px-3 py-2 whitespace-nowrap">
             <input type="number" name="tiempo" value="0" min="0" max="24" step="any" class="p-1 border rounded text-sm w-full" oninput="window.calcularConsumoTotal()">
         </td>
         <td class="px-3 py-2 whitespace-nowrap">
             <button type="button" onclick="window.eliminarFila(this)" class="text-red-600 hover:text-red-800 font-bold text-xl leading-none">
                 &times;
             </button>
         </td>
     `;
     
     // Llamar a calcularConsumoTotal después de añadir la fila
     setTimeout(() => calcularConsumoTotal(), 0);
 }
 
 /**
  * Elimina la fila de la tabla a partir del botón presionado y recalcula el total.
  * @param {HTMLElement} button El botón de eliminar presionado.
  */
 export function eliminarFila(button) {
     const fila = button.parentNode.parentNode;
     fila.parentNode.removeChild(fila);
     calcularConsumoTotal();
     // Recalcular el regulador después de eliminar
     if (window.calcularCorrienteReguladorFinal) {
         window.calcularCorrienteReguladorFinal();
     }
 }
 
 /**
  * Calcula el Consumo Total de Energía Diaria (ET) ajustado por eficiencias.
  * @returns {number} El consumo total diario en Wh/día.
  */
 export function calcularConsumoTotal() {
     const cuerpoTabla = document.getElementById('cuerpo-tabla-consumo');
     const filas = cuerpoTabla.getElementsByTagName('tr');
     
     // Asegurar que exista un input para la eficiencia del inversor y batería
     const etaBATInput = document.getElementById('etaBat');
     const etaINVInput = document.getElementById('etaInv');
     
     const etaBAT = parseFloat(etaBATInput?.value) || 0;
     const etaINV = parseFloat(etaINVInput?.value) || 0;
     
     if (isNaN(etaBAT) || etaBAT <= 0 || isNaN(etaINV) || etaINV <= 0) {
         document.getElementById('consumo-total-resultado').textContent = `0 Wh/día`;
         mostrarMensaje('Error de Eficiencia', 'Las eficiencias de Batería e Inversor deben ser valores válidos > 0.', 'error');
         
         // Devolvemos 0 y notificamos el cambio, que detendrá los cálculos de dimensionamiento.
         if (onConsumptionChangeCallback) onConsumptionChangeCallback(0);
         return 0;
     }
     if (etaBAT > 1.0 || etaINV > 1.0) {
         mostrarMensaje('Advertencia', 'Las eficiencias suelen ser menores o iguales a 1.0 (100%).', 'warning');
     }
 
     let EDC = 0; // Energía de Consumo DC (Wh/día)
     let EAC = 0; // Energía de Consumo AC (Wh/día)
     let is_valid = true;
 
     for (let i = 0; i < filas.length; i++) {
         const row = filas[i];
         
         const tipo = row.querySelector('select[name="tipo"]').value;
         const potencia = parseFloat(row.querySelector('input[name="potencia"]').value) || 0;
         const tiempo = parseFloat(row.querySelector('input[name="tiempo"]').value) || 0;
         
         if (potencia < 0 || tiempo < 0 || tiempo > 24) {
             mostrarMensaje('Error de Entrada', `La potencia y el tiempo (máx. 24h) deben ser valores positivos.`, 'error');
             is_valid = false;
             break;
         }
 
         const energiaDiaria = potencia * tiempo;
         
         if (tipo === 'DC') {
             EDC += energiaDiaria;
         } else { // tipo === 'AC'
             EAC += energiaDiaria;
         }
     }
 
     if (!is_valid) {
         document.getElementById('consumo-total-resultado').textContent = `0 Wh/día`;
         if (onConsumptionChangeCallback) onConsumptionChangeCallback(0);
         return 0;
     }
 
     // Fórmulas de ajuste por eficiencia (ET)
     const energiaDC_ajustada = EDC / etaBAT;
     const energiaAC_ajustada = EAC / (etaBAT * etaINV);
 
     const ET = energiaDC_ajustada + energiaAC_ajustada;
 
     document.getElementById('consumo-total-resultado').textContent = `${ET.toFixed(2)} Wh/día`;
     
     // Llama al callback en main_script.js con el valor de ET
     if (onConsumptionChangeCallback) {
         onConsumptionChangeCallback(ET);
     }
 
     return ET;
 }
 
 // =================================================================================
 // === FUNCIONES DE EXTRACCIÓN DE POTENCIA INSTANTÁNEA (AÑADIDA)
 // =================================================================================
 
 /**
  * Recorre la tabla y suma las potencias instantáneas DC y AC.
  * Esta suma se usa como proxy de la Máxima Potencia Concurrente (Pdc, Pac)
  * para dimensionar el Regulador/Inversor.
  * @returns {{Pdc_W: number, Pac_W: number}} Las potencias totales instantáneas en Watts.
  */
 export function obtenerPotenciaInstantaneaTotal() {
     const cuerpoTabla = document.getElementById('cuerpo-tabla-consumo');
     const filas = cuerpoTabla.getElementsByTagName('tr');
     
     let Pdc_W = 0;
     let Pac_W = 0;
     
     for (let i = 0; i < filas.length; i++) {
         const row = filas[i];
         
         // Usamos optional chaining (?) por si acaso, aunque los inputs deberían existir.
         const tipoElement = row.querySelector('select[name="tipo"]');
         const potenciaElement = row.querySelector('input[name="potencia"]');
         
         // Asegurar que los elementos existen y tienen valores
         const tipo = tipoElement?.value;
         const potencia = parseFloat(potenciaElement?.value) || 0;
         
         if (tipo === 'DC') {
             Pdc_W += potencia;
         } else if (tipo === 'AC') { 
             Pac_W += potencia;
         }
     }
 
     return { Pdc_W, Pac_W };
 }
 
 
 // =================================================================================
 // === INICIALIZACIÓN
 // =================================================================================
 
 // Añadir una fila por defecto al cargar la página
 document.addEventListener('DOMContentLoaded', () => {
     agregarFilaConsumo();
     
     // Agregar listeners para el cambio de eficiencias
     document.getElementById('etaBat')?.addEventListener('input', calcularConsumoTotal);
     document.getElementById('etaInv')?.addEventListener('input', calcularConsumoTotal);
 
     // Los listeners de potencia (para el regulador) se añadieron dentro de agregarFilaConsumo
     // y en los cálculos de main_script.js, pero es buena práctica incluirlos aquí también si 
     // cambian los valores de eficiencia.
     document.getElementById('etaBat')?.addEventListener('input', window.calcularCorrienteReguladorFinal);
     document.getElementById('etaInv')?.addEventListener('input', window.calcularCorrienteReguladorFinal);
 });