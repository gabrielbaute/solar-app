/**
 * @fileoverview Funciones para la generación de un reporte PDF para sistemas 
 * fotovoltaicos CONECTADOS A RED (ON-GRID).
 * Requiere la librería jspdf y jspdf-autotable cargadas en el HTML.
 */

// Globales para el PDF
const today = new Date();
const fecha = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

/**
 * Función que extrae los valores del DOM de forma segura.
 */
const extractDataGrid = () => {
    const getVal = (id) => {
        const el = document.getElementById(id);
        if (!el) return 'N/A';
        const value = el.value !== undefined ? el.value.trim() : el.textContent.trim();
        return value === '' || value === '---' ? 'N/A' : value;
    };

    const hspAnualRaw = getVal('hsp-anual');
    const hspAnualNum = parseFloat(hspAnualRaw) || 0;
    const hspDiarioCalculado = hspAnualNum > 0 ? (hspAnualNum / 365).toFixed(2) : 'N/A';

    return { 
        // Datos de entrada
        consumoAnual_kWh: getVal('consumo-anual'),
        factorRendimiento: getVal('rendimiento-sistema'),
        potenciaModulo_Wp: getVal('potencia-modulo'),
        latitud: getVal('latitud-grid'),
        longitud: getVal('longitud-grid'),
        inclinacionOptima: getVal('inclinacion-grid'),
        HSP_anual: hspAnualNum.toFixed(2),
        HSP_diario: hspDiarioCalculado,
        
        // Datos de Interconexión
        voltajeRed: getVal('voltaje-red'),
        distanciaAC: getVal('distancia-ac'),
        caidaMaxAdmitida: getVal('caida-tension-max'), // Nuevo
        
        // Resultados finales
        P_pico_req: getVal('resultado-ppico'),
        N_modulos: getVal('resultado-nmodulos'),
        P_total_instalada: getVal('resultado-ptotal'),
        P_inversor_min: getVal('resultado-pinversor'),
        breakerSugerido: getVal('resultado-breaker'),
        seccionCableAC: getVal('resultado-cable-ac') // Nuevo
    };
};

/**
 * Lee la tabla de dispositivos para detallar el consumo en el PDF.
 */
function obtenerFilasDeTablaDeConsumo() {
    const cuerpoTabla = document.getElementById('devices-container-hook'); 
    if (!cuerpoTabla) return { data: [], EAC: 0 };

    const filas = cuerpoTabla.getElementsByClassName('device-row');
    const data = [];
    let E_total_Wh = 0; 

    for (let i = 0; i < filas.length; i++) {
        const row = filas[i];
        const equipoElement = row.querySelector('.device-name');
        const tipoElement = row.querySelector('.device-type'); 
        const potenciaElement = row.querySelector('.device-power');
        const cantidadElement = row.querySelector('.device-qty');
        const tiempoElement = row.querySelector('.device-hours');

        if (!equipoElement || !potenciaElement || !tiempoElement || !cantidadElement) continue;

        const equipo = equipoElement.value.trim() || 'Sin Nombre';
        const tipo = tipoElement ? tipoElement.value : 'AC'; 
        const potencia = parseFloat(potenciaElement.value) || 0;
        const tiempo = parseFloat(tiempoElement.value) || 0;
        const cantidad = parseFloat(cantidadElement.value) || 1; 
        
        const energiaDiariaCalculada = potencia * tiempo * cantidad; 
        E_total_Wh += energiaDiariaCalculada; 
        
        data.push([
            equipo, tipo, `${potencia.toFixed(0)} W`, `${cantidad}`, `${tiempo.toFixed(1)} h/día`, `${energiaDiariaCalculada.toFixed(2)} Wh/día`
        ]);
    }
    return { data, EAC: E_total_Wh };
}

/**
 * Función principal para generar el PDF.
 */
window.generarReporteGrid = function() {
    if (!window.jspdf) {
        alert("Error: La librería jsPDF no se ha cargado correctamente.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4'); 
    
    let y = 15; 
    const data = extractDataGrid(); 
    const consumoDataResult = obtenerFilasDeTablaDeConsumo();
    const consumoData = consumoDataResult.data;

    // --- 1. ENCABEZADO ---
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 122, 204); 
    pdf.text('REPORTE TÉCNICO FOTOVOLTAICO', 105, y, { align: 'center' }); 
    y += 8;
    pdf.setFontSize(14);
    pdf.text('SISTEMA ON-GRID (NORMA IEEE 1547)', 105, y, { align: 'center' });
    
    y += 10;
    pdf.setDrawColor(0, 122, 204);
    pdf.setLineWidth(0.8);
    pdf.line(10, y, 200, y); 

    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100);
    pdf.text(`Fecha de generación: ${fecha}`, 10, y);
    y += 10;

    // --- 2. SECCIÓN: CONSUMO ---
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0);
    pdf.text('1. Detalle de Consumo Eléctrico', 10, y);
    y += 4;

    if (consumoData.length > 0) {
        pdf.autoTable({
            startY: y + 2,
            head: [['Dispositivo', 'Tipo', 'Potencia (W)', 'Cant.', 'Horas/día', 'Consumo (Wh/día)']],
            body: consumoData,
            theme: 'striped',
            headStyles: { fillColor: [40, 40, 40] },
            styles: { fontSize: 8.5 },
            columnStyles: {
                0: { cellWidth: 50 },
                1: { cellWidth: 15, halign: 'center' },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 30, halign: 'center' },
                5: { cellWidth: 40, halign: 'right' }
            }
        });
        y = pdf.lastAutoTable.finalY + 10;
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Consumo Anual Total Requerido: ${data.consumoAnual_kWh} kWh/año`, 10, y); 
    y += 12;

    // --- 3. SECCIÓN: DATOS DE DISEÑO ---
    if (y > 230) { pdf.addPage(); y = 20; }
    pdf.setFontSize(14);
    pdf.text('2. Datos del Emplazamiento y Diseño', 10, y);
    
    const datosDiseño = [
        ['Latitud / Longitud:', `${data.latitud} / ${data.longitud}`],
        ['HSP Diario Promedio:', `${data.HSP_diario} h/día`],
        ['Irradiación Total Anual:', `${data.HSP_anual} kWh/m²/año`],
        ['Inclinación Óptima:', `${data.inclinacionOptima}°`],
        ['Factor de Rendimiento:', `${data.factorRendimiento} %`],
        ['Potencia del Módulo Solar:', `${data.potenciaModulo_Wp} Wp`]
    ];

    pdf.autoTable({
        startY: y + 4,
        body: datosDiseño,
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } }
    });
    y = pdf.lastAutoTable.finalY + 12;
    
    // --- 4. SECCIÓN: RESULTADOS DEL SISTEMA ---
    pdf.setFontSize(14);
    pdf.text('3. Resultados del Dimensionamiento', 10, y);
    
    const datosResultados = [
        ['Potencia Pico Requerida (DC):', `${data.P_pico_req} kWp`],
        ['Número de Módulos Necesarios:', data.N_modulos],
        ['Potencia Real Instalada:', `${data.P_total_instalada} kWp`],
        ['Potencia Mínima del Inversor (AC):', `${data.P_inversor_min} kW`],
    ];

    pdf.autoTable({
        startY: y + 4,
        head: [['Concepto', 'Resultado']],
        body: datosResultados,
        theme: 'striped',
        headStyles: { fillColor: [0, 102, 204] }
    });
    y = pdf.lastAutoTable.finalY + 12;

    // --- 5. SECCIÓN: INTERCONEXIÓN Y CÁLCULO DE CABLE ---
    if (y > 200) { pdf.addPage(); y = 20; }
    pdf.setFontSize(14);
    pdf.setTextColor(0, 102, 204);
    pdf.text('4. Especificaciones de Interconexión AC', 10, y);
    pdf.setTextColor(0);
    y += 6;

    const datosInterconexion = [
        ['Voltaje de Red Nominal:', `${data.voltajeRed} VAC`],
        ['Distancia Inversor - Tablero:', `${data.distanciaAC} metros`],
        ['Caída de Tensión Máxima:', `${data.caidaMaxAdmitida} %`],
        ['Sección Transversal de Cable:', `${data.seccionCableAC}`],
        ['Protección AC (Breaker):', `${data.breakerSugerido} `],
        ['Normativa de Seguridad:', 'IEEE 1547 (Anti-Isla)']
    ];

    pdf.autoTable({
        startY: y,
        body: datosInterconexion,
        theme: 'grid',
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70, fillColor: [240, 240, 240] } }
    });

    y = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80);
    const notaLegal = "Nota: El cálculo de la sección del conductor se basa en la resistividad del cobre y el límite de caída de tensión seleccionado. Se recomienda verificar el cumplimiento de los códigos eléctricos locales (NEC/CEN) para la instalación física.";
    pdf.text(notaLegal, 10, y, { maxWidth: 180 });

    // --- 6. PIE DE PÁGINA ---
    const pageCount = pdf.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text('Software de Ingeniería Fotovoltaica | Cálculos de Caída de Tensión y Protecciones', 105, 285, { align: 'center' });
    }

    pdf.save(`Reporte_Tecnico_OnGrid_${fecha}.pdf`);
};