/**
 * @fileoverview Funciones para la generación de un reporte PDF a partir de los resultados de dimensionamiento FV.
 * Requiere la librería jspdf y jspdf-autotable.
 */

// Globales para el PDF
const today = new Date();
const fecha = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

document.addEventListener('DOMContentLoaded', () => {
    const downloadButton = document.getElementById('btn-descargar-reporte');

    if (downloadButton) {
        downloadButton.addEventListener('click', generateReportPDF);
    }
});

/**
 * Función auxiliar para cargar la imagen antes de generar el PDF
 */
const cargarImagen = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

/**
 * Función que extrae los valores numéricos y de texto necesarios de los inputs 
 */
const extractData = () => {
    // 1. Valores de Dimensionamiento Principal (Inputs)
    const Et = document.getElementById('input-et')?.value || 'N/A';
    const HPS = document.getElementById('input-hps')?.value || 'N/A';
    const Pp = document.getElementById('input-pp')?.value || 'N/A';
    const Pg = document.getElementById('input-pg')?.value || 'N/A';
    const Vbat = document.getElementById('input-vbat')?.value || 'N/A';
    
    // 2. Eficiencias y Parámetros
    const autonomia = document.getElementById('input-autonomia')?.value || 'N/A';
    const pd = document.getElementById('input-pd')?.value || 'N/A';
    const etaBAT = document.getElementById('etaBat')?.value || 'N/A';
    const etaINV = document.getElementById('etaInv')?.value || 'N/A';
    
    // --- DATOS GEOGRÁFICOS ---
    const latitud = document.getElementById('latitud')?.value || 'N/A';
    const longitud = document.getElementById('longitud')?.value || 'N/A';
    
    const pais_el = document.getElementById('pais-resultado')?.textContent.trim() || 'No Definido'; 
    const pais_parts = pais_el.split('**');
    const pais = pais_parts.length > 2 ? pais_parts[1].trim() : 'No Definido'; 
    
    const inclinacionOptima = document.getElementById('input-inclinacion')?.value || 'N/A'; 
    const orientacionAzimut = document.getElementById('input-azimut')?.value || 'N/A'; 
    
    // 3. Resultados de Paneles
    const Nt_dom = document.querySelector('#resultado-paneles')?.textContent.match(/\d+/) || ['0'];
    
    const matrizCont = document.getElementById('resultado-matriz');
    const numsMatriz = matrizCont ? matrizCont.textContent.match(/\d+/g) : null;
    const Ns = numsMatriz ? numsMatriz[0] : '0';
    const Np = numsMatriz && numsMatriz.length > 1 ? numsMatriz[1] : '0';
    
    const ns_num = parseInt(Ns) || 0;
    const np_num = parseInt(Np) || 0;
    const Nt_total = (ns_num * np_num) > 0 ? (ns_num * np_num).toString() : Nt_dom[0];

    // 4. Resultados de Componentes
    const bateriaText = document.getElementById('resultado-baterias')?.textContent || '';
    const Cn_Ah = bateriaText.match(/\d+\.?\d*\s*Ah/) || ['N/A Ah'];

    const I_G = document.getElementById('input-ig-final')?.textContent.trim() || 'N/A'; 
    
    const reguladorText = document.getElementById('resultado-regulador')?.textContent || '';
    const I_R_match = reguladorText.match(/Nominal[^0-9]*(\d+\.?\d*)\s*A/) || reguladorText.match(/(\d+\.?\d*)\s*A/);
    const I_R_text = I_R_match ? I_R_match[0] : 'N/A A';

    const inversorText = document.getElementById('resultado-inversor')?.textContent || '';
    // EXTRACCIÓN LIMPIA DEL VALOR DEL INVERSOR (Elimina "Nominal Mínima")
    const P_nominal_match = inversorText.match(/(\d+\.?\d*)\s*W/);
    const P_nominal_W = P_nominal_match ? P_nominal_match[0] : 'N/A W';
    
    // 5. Resultados de Cableado
    const L_ida_m = document.getElementById('input-longitud-cable')?.value || 0;
    const S_seccion_mm2 = document.getElementById('input-seccion-cable')?.value || 0;
    const resistividad_val = document.getElementById('input-resistividad')?.value || 0.0172;
    
    const Pr_W_el = document.querySelector('#resultado-cableado')?.textContent.match(/\d+\.?\d*\s*W/) || ['N/A W'];
    
    const I_G_num = parseFloat(I_G.replace(/[^0-9.]/g, '')) || 0; 
    const Vbat_num = parseFloat(Vbat) || 0;

    let Rc_ohms_num = 0;
    let Rc_ohms_calc_display = 'N/A';
    
    if (parseFloat(L_ida_m) > 0 && parseFloat(S_seccion_mm2) > 0) {
        Rc_ohms_num = (parseFloat(resistividad_val) * (2 * parseFloat(L_ida_m))) / parseFloat(S_seccion_mm2);
        Rc_ohms_calc_display = Rc_ohms_num.toFixed(4);
    }

    let DeltaV_calc = 'N/A';
    let Perdida_pct_calc = 'N/A';
    
    if (I_G_num > 0 && Rc_ohms_num > 0 && Vbat_num > 0) {
        const DeltaV_val = I_G_num * Rc_ohms_num;
        DeltaV_calc = DeltaV_val.toFixed(2);
        const Perdida_pct_val = (DeltaV_val / Vbat_num) * 100;
        Perdida_pct_calc = Perdida_pct_val.toFixed(2);
    }

    return { 
        Et, HPS, Pp, Pg, Vbat, autonomia, pd, etaBAT, etaINV,
        latitud, longitud, pais, inclinacionOptima, orientacionAzimut, 
        Nt_total, Ns, Np, Cn_Ah: Cn_Ah[0], 
        I_G: I_G.replace(' A A', ' A'), 
        I_C: 'N/A', 
        I_R: I_R_text.replace(' A A', ' A'),
        Pac_W: 'N/A', 
        P_nominal_W,
        L_ida_m, S_seccion_mm2, 
        Rc_ohms: Rc_ohms_calc_display !== 'N/A' ? `${Rc_ohms_calc_display} Ohmios` : 'N/A', 
        Pr_W: Pr_W_el[0],
        DeltaV_V: DeltaV_calc,       
        Perdida_pct: Perdida_pct_calc 
    };
};

function obtenerFilasDeTablaDeConsumo() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-consumo'); 
    if (!cuerpoTabla) return { data: [], EAC: 0, EDC: 0 };

    const filas = cuerpoTabla.getElementsByTagName('tr');
    const data = [];
    let EDC = 0; 
    let EAC = 0; 

    for (let i = 0; i < filas.length; i++) {
        const row = filas[i];
        const tipoElement = row.querySelector('select[name="tipo"]');
        const equipoElement = row.querySelector('input[name="nombre"]');
        const potenciaElement = row.querySelector('input[name="potencia"]');
        const tiempoElement = row.querySelector('input[name="tiempo"]');
        const cantidadElement = row.querySelector('input[name="cantidad"]');

        if (!tipoElement || !equipoElement || !potenciaElement || !tiempoElement || !cantidadElement) continue;

        const tipo = tipoElement.value;
        const equipo = equipoElement.value.trim() || 'Sin Nombre';
        const potencia = parseFloat(potenciaElement.value) || 0;
        const tiempo = parseFloat(tiempoElement.value) || 0;
        const cantidad = parseFloat(cantidadElement.value) || 1; 
        const energiaDiariaCalculada = potencia * tiempo * cantidad; 
        
        if (tipo === 'DC') EDC += energiaDiariaCalculada;
        else if (tipo === 'AC') EAC += energiaDiariaCalculada;

        data.push([tipo, equipo, `${potencia.toFixed(0)} W`, `${tiempo.toFixed(1)} h/día`, `${cantidad}`, `${energiaDiariaCalculada.toFixed(2)} Wh/día`]);
    }
    return { data, EAC, EDC };
}

async function generateReportPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4'); 
    
    let y = 10; 
    const data = extractData();
    const consumoDataResult = obtenerFilasDeTablaDeConsumo();
    const consumoData = consumoDataResult.data;

    // --- 1. ENCABEZADO ---
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('REPORTE DE DIMENSIONAMIENTO FOTOVOLTAICO AISLADO', 105, y, null, null, 'center'); 
    y += 10;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Fecha del Reporte: ${fecha}`, 105, y, null, null, 'center');
    y += 10;
    pdf.line(10, y, 200, y); 
    y += 8;

    // --- 2. TABLA DE CONSUMO ---
    if (y > 250) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('1. Tabla de Consumo Eléctrico Detallado', 10, y);
    y += 4;

    if (consumoData.length > 0) {
        pdf.autoTable({
            startY: y + 2,
            head: [['Tipo', 'Dispositivo', 'Potencia (W)', 'Horas/día', 'Cantidad', 'Consumo Diario (Wh/día)']],
            body: consumoData,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1 },
            headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255] }
        });
        y = pdf.autoTable.previous.finalY + 5;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Energía Total Requerida: ${data.Et} kWh/día`, 10, y, { fontStyle: 'bold' }); 
        y += 8;
    }

    // --- 3. PARÁMETROS GEOGRÁFICOS ---
    if (y > 240) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('2. Parámetros Geográficos y de Diseño', 10, y);
    y += 4;

    const datosParametros = [
        ['País:', { content: data.pais, styles: { fontStyle: 'bold' } }], 
        ['Latitud / Longitud:', `${data.latitud}° / ${data.longitud}°`],
        ['HSP Mínima (Irradiación):', `${data.HPS} kWh/m²/día`],
        ['Inclinación Óptima:', `${data.inclinacionOptima}°`],
        ['Orientación (Azimut):', `${data.orientacionAzimut}°`],
        ['Voltaje del Banco: ', `${data.Vbat} V`],
        ['Días de Autonomía:', `${data.autonomia} días`],
        ['Profundidad de Descarga:', data.pd],
        ['Factor de Pérdidas:', data.Pg],
        ['Eficiencia de Batería:', data.etaBAT],
        ['Eficiencia de Inversor:', data.etaINV]
    ];

    pdf.autoTable({
        startY: y + 2,
        head: [['Parámetro', 'Valor']],
        body: datosParametros,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
        headStyles: { fillColor: [50, 50, 50] }
    });
    y = pdf.autoTable.previous.finalY + 8;

    // --- 4. MATRIZ FV ---
    if (y > 240) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('3. Dimensionamiento de la Matriz Fotovoltaica', 10, y);
    y += 4;
    
    const datosFV = [
        ['Potencia de Panel:', `${data.Pp} Wp`],
        ['Paneles en Serie:', data.Ns],
        ['Ramas en Paralelo:', data.Np],
        ['Paneles Totales:', { content: data.Nt_total, styles: { fillColor: [200, 255, 200], fontStyle: 'bold' } }],
    ];

    pdf.autoTable({
        startY: y + 2,
        head: [['Concepto', 'Resultado']],
        body: datosFV,
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [150, 100, 200] } 
    });
    y = pdf.autoTable.previous.finalY + 8;

    // --- 5. BATERÍAS ---
    if (y > 250) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('4. Capacidad del Banco de Baterías', 10, y);
    y += 4;
    
    pdf.autoTable({
        startY: y + 2,
        head: [['Parámetro', 'Valor Mínimo']],
        body: [['Capacidad Nominal Requerida:', { content: `${data.Cn_Ah}`, styles: { fillColor: [255, 200, 100], fontStyle: 'bold' } }]],
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [255, 150, 50] } 
    });
    y = pdf.autoTable.previous.finalY + 8;

    // --- 6. REGULADOR E INVERSOR ---
    if (y > 210) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('5. Dimensionamiento de Regulador e Inversor', 10, y);
    y += 4;

    const datosComponentes = [
        [{ rowSpan: 3, content: 'Regulador de Carga', styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } }, 'Corriente Generada:', data.I_G],
        ['Corriente Consumida ', data.I_C],
        ['Corriente Nominal (Mínimo):', { content: `${data.I_R}`, styles: { fillColor: [255, 220, 220], fontStyle: 'bold' } }],
        [{ rowSpan: 3, content: 'Inversor (DC/AC):', styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } }, 'Potencia AC Máxima:', `${data.Pac_W} W`],
        ['Tensión de Entrada', `${data.Vbat} V`], 
        ['Potencia Nominal (Mínimo)', { content: data.P_nominal_W, styles: { fillColor: [200, 200, 255], fontStyle: 'bold' } }],
    ];

    pdf.autoTable({
        startY: y + 2,
        head: [['Componente', 'Parámetro', 'Valor']],
        body: datosComponentes,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [0, 100, 150] } 
    });
    y = pdf.autoTable.previous.finalY + 8;

    // --- 7. CABLEADO ---
    if (y > 230) { pdf.addPage(); y = 15; }
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('6. Pérdidas en el Cableado DC', 10, y);
    y += 4;

    const datosCableado = [
        ['Corriente de Diseño:', data.I_G],
        ['Longitud del Cable:', `${data.L_ida_m} m`],
        ['Sección del Cable:', `${data.S_seccion_mm2} mm\u00b2`], 
        ['Resistencia Total:', data.Rc_ohms], 
        ['Potencia Perdida:', data.Pr_W], 
        ['Caída de Tensión:', `${data.DeltaV_V} V`], 
        ['Pérdida Relativa Porcentual:', { content: `${data.Perdida_pct} %`, styles: { fillColor: [255, 255, 200], fontStyle: 'bold' } }], 
    ];

    pdf.autoTable({
        startY: y + 2,
        head: [['Parámetro', 'Valor']],
        body: datosCableado,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [150, 150, 0] } 
    });

    // --- 8. ESQUEMA TÉCNICO  ---
    try {
        pdf.addPage();
        y = 20;
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('7. Diagrama del Sistema', 10, y);
        y += 10;

        const imgDiagrama = await cargarImagen('img/Sistema fotovoltaico autonomo.png');
        const posX = 50; 
        const anchoImg = 110;
        const altoImg = 145;
        pdf.addImage(imgDiagrama, 'PNG', posX, y, anchoImg, altoImg);

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 51, 153);

        // Paneles
        pdf.text(`${data.Nt_total} Paneles (${data.Pp}Wp)`, posX + 78, y + 15);
        pdf.text(`Arreglo: ${data.Ns}S x ${data.Np}P`, posX + 78, y + 21);
        
        // Regulador
        pdf.text(`Regulador: ${data.I_R}`, posX + 95, y + 55);
        
        // Batería (Debajo del dibujo)
        pdf.text(`Banco: ${data.Cn_Ah}`, posX + 42, y + 105);
        pdf.text(`Tensión: ${data.Vbat} V`, posX + 42, y + 111);
        
        // Inversor (SOLO MUESTRA EL VALOR, SIN NOMINAL MÍNIMA)
        pdf.text(`Inversor: ${data.P_nominal_W}`, posX - 28, y + 115);
        
        // Cargas (Ajustadas para no tocar iconos)
        pdf.text(`Carga DC: ${consumoDataResult.EDC.toFixed(0)} Wh/d`, posX + 105, y + 88);
        pdf.text(`Carga AC: ${consumoDataResult.EAC.toFixed(0)} Wh/d`, posX + 105, y + 145);

        pdf.setTextColor(0, 0, 0);
    } catch (e) {
        console.error("No se pudo cargar la imagen", e);
    }

    pdf.save(`Reporte_Dimensionamiento_FV_${fecha}.pdf`);

    // --- 9. PIE DE PÁGINA ---
    const pageCount = pdf.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text('Generado por Aplicación de Dimensionamiento Fotovoltaico', 105, 285, { align: 'center' });
    }

}

window.generateReportPDF = generateReportPDF;