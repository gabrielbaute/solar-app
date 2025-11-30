/**
 * @fileoverview Contiene todas las constantes y funciones matemáticas para el cálculo de radiación solar y dimensionamiento FV.
 */

// === CONSTANTES FÍSICAS Y DE CONVERSIÓN ===
export const PI = Math.PI;
export const RAD_A_DEG = 180 / PI; 
export const ICS = 1367; // Constante solar en W/m²
export const FACTOR_G0D = 24 / PI; 

// =================================================================================
// === FÓRMULAS BÁSICAS  ===
// =================================================================================

/**
 * Calcula la Potencia Pico Requerida (Ppico) para el generador.
 * P_pico = ET_Wh / (HPS_h * Cp)
 * @param {number} ET_requerida Energía Total requerida (Wh/día).
 * @param {number} HPS_min Hora Pico Solar mínima (kWh/m² día).
 * @param {number} Cp Factor de Pérdidas del Sistema.
 * @returns {number} La potencia pico requerida en Wp.
 */
export function dimensionarGenerador(ET_requerida, HPS_min, Cp = 0.8) { 
    // HPS_min está en kWh/m² día. Cp es adimensional. ET en Wh/día.
    // El resultado es Wp.
    if (HPS_min <= 0 || Cp <= 0) return 0;
    const Ppico = ET_requerida / (HPS_min * Cp); 
    return Ppico;
}

/**
 * Calcula el parámetro Rb, la razón de irradiación solar directa en superficie inclinada y horizontal.
 * @param {number} phi_rad Latitud en radianes.
 * @param {number} delta_rad Declinación solar en radianes.
 * @param {number} omega_s_rad Ángulo horario de la puesta del sol en radianes.
 * @param {number} beta_rad Ángulo de inclinación del panel en radianes.
 * @returns {number} Factor de corrección Rb.
 */
export function calcularRb(phi_rad, delta_rad, omega_s_rad, beta_rad) {
    const p = phi_rad;
    const b = beta_rad;
    const d = delta_rad;
    const w = omega_s_rad;

    const num_term1 = w * Math.sin(d) * Math.sin(p - b);
    const num_term2 = Math.cos(d) * Math.cos(p - b) * Math.sin(w);
    const numerador = num_term1 + num_term2;

    const den_term1 = w * Math.sin(d) * Math.sin(p);
    const den_term2 = Math.cos(d) * Math.cos(p) * Math.sin(w);
    const denominador = den_term1 + den_term2;

    if (denominador === 0) { 
        // Caso polar o ecuador al mediodía con beta = phi
        return 0; 
    } 
    
    return numerador / denominador;
}

/**
 * Calcula la Irradiación Global Inclinada (Gi) a partir de los componentes.
 * @param {number} inclinacionRadianes Ángulo de inclinación (beta) en radianes.
 * @param {object} item Objeto con datos del mes (Gd_kWh, G0d_kWh, Dd, Id, delta, omega_s).
 * @param {number} latitudRadianes Latitud del lugar en radianes.
 * @returns {{Rb: number, Id_beta: number, Dd_beta: number, Gi: number}} Los componentes y la Gi total.
 */
export function calcularRadiacionInclinada(inclinacionRadianes, item, latitudRadianes) {
    const Rb = calcularRb(latitudRadianes, item.delta, item.omega_s, inclinacionRadianes);

    const Gd_kWh = item.Gd_kWh;
    const G0d_kWh = item.G0d_kWh;
    const Dd = item.Dd;
    const Id = item.Id; // Irradiación directa en horizontal

    let Id_beta = NaN;
    let Dd_beta = NaN;
    let Gi = NaN;
    
    // Solo si hay datos válidos de radiación
    if (typeof Gd_kWh === 'number' && Gd_kWh > 0 && G0d_kWh > 0) {
        
        // 1. Componente Directo (Id_beta)
        Id_beta = Id * Rb;
        if (Id_beta < 0) Id_beta = 0; // No puede ser negativo
        
        // 2. Componente Difuso (Dd_beta) - Modelo de uniformidad/isotropía simplificado (Hayek)
        const Ai = Id / G0d_kWh; 
        const anisotropyIndex = Math.max(0, Math.min(1, Ai)); // Índice de anisotropía Kt

        // Factor de vista al cielo
        const Rd_term = 0.5 * (1 + Math.cos(inclinacionRadianes)); 

        // Modelo de difusa (Directo + Circunglobal)
        Dd_beta = Dd * anisotropyIndex * Rb + Dd * (1 - anisotropyIndex) * Rd_term;

        // 3. Componente Reflejado (Rr)
        const rho = 0.2; // Albedo (constante por defecto)
        const Rr_term = 0.5 * (1 - Math.cos(inclinacionRadianes));
        const Rr = rho * Gd_kWh * Rr_term;
        
        // 4. Irradiación Global Inclinada (Gi)
        Gi = Id_beta + Dd_beta + Rr;
    }

    return {
        Rb: Rb,
        Id_beta: Id_beta,
        Dd_beta: Dd_beta,
        Gi: Gi
    };
}

/**
 * Calcula la Declinación Solar (delta) en radianes.
 * Fórmula de Cooper.
 * @param {number} dn Día del año (1 a 365).
 * @returns {number} Declinación solar en radianes.
 */
export function calcularDelta(dn) {
    const gamma = 2 * PI * ((dn - 1) / 365);
    
    const delta_rad = (0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
        - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
        - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma));
        
    return delta_rad;
}

/**
 * Calcula la Irradiación Extraterrestre Diaria (G0d) en W·h/m² y el ángulo horario (omega_s).
 * @param {number} latitudRadianes Latitud en radianes.
 * @param {number} delta_rad Declinación solar en radianes.
 * @param {number} dn Día del año (1 a 365).
 * @returns {{omega_s: number, E0: number, G0d_kWh: number}} Omega_s en rad, E0, y G0d en kWh/m².
 */
export function calcularG0d(latitudRadianes, delta_rad, dn) {
    const argE0 = (2 * PI * dn) / 365;
    const E0 = (1 + 0.033 * Math.cos(argE0)); // Factor de corrección de la distancia Tierra-Sol (E0)
    
    const operandoArccos = -Math.tan(latitudRadianes) * Math.tan(delta_rad);
    let omega_s_rad = 0;
    let G0d_valor_Wh = 0;
    
    if (operandoArccos >= -1 && operandoArccos <= 1) {
        // Zonas templadas y tropicales
        omega_s_rad = Math.acos(operandoArccos); 
        const termino1 = omega_s_rad * Math.sin(delta_rad) * Math.sin(latitudRadianes);
        const termino2 = Math.cos(delta_rad) * Math.cos(latitudRadianes) * Math.sin(omega_s_rad);
        G0d_valor_Wh = FACTOR_G0D * ICS * E0 * (termino1 + termino2); 
    } else if (operandoArccos < -1) {
        // Polo en verano (sol de medianoche)
        omega_s_rad = PI; 
        const termino1_polar = omega_s_rad * Math.sin(delta_rad) * Math.sin(latitudRadianes);
        G0d_valor_Wh = FACTOR_G0D * ICS * E0 * termino1_polar; 
    } else {
        // Polo en invierno (noche polar)
        omega_s_rad = 0;
        G0d_valor_Wh = 0; 
    }

    return {
        omega_s: omega_s_rad,
        E0: E0,
        G0d_kWh: G0d_valor_Wh / 1000 // Convertir a kWh/m² día
    };
}

/**
 * Calcula los componentes difuso (Dd) y directo (Id) de la radiación horizontal.
 * Utiliza el modelo de Orgill y Hollands (para el factor Kd).
 * @param {number} Gd_kWh Irradiación Global Diaria en Horizontal (API) en kWh/m².
 * @param {number} G0d_kWh Irradiación Extraterrestre Diaria en Horizontal en kWh/m².
 * @returns {{Kd: number, Dd: number, Id: number}} Factor Kd, Radiación Difusa (Dd) y Directa (Id) en kWh/m².
 */
export function calcularComponentesHorizontales(Gd_kWh, G0d_kWh) {
    let Kd = NaN;
    let Dd = NaN;
    let Id = NaN;

    if (typeof Gd_kWh === 'number' && Gd_kWh > 0 && G0d_kWh > 0) {
        // 1. Factor de Claridad (Kd)
        Kd = Gd_kWh / G0d_kWh; 
        if (Kd > 1) Kd = 1.0; 
        
        // 2. Componente Difuso (Dd) - Correlación de Orgill y Hollands (simplificado/adaptado)
        Dd = Gd_kWh * (1.39 - 4.027 * Kd + 5.531 * Math.pow(Kd, 2) - 3.108 * Math.pow(Kd, 3));
        if (Dd < 0) Dd = 0;
        
        // 3. Componente Directo (Id)
        Id = Gd_kWh - Dd;
        if (Id < 0) Id = 0;
    }
    
    return { Kd, Dd, Id };
}

// =================================================================================
// === FÓRMULAS DE DIMENSIONAMIENTO DEL SISTEMA ===
// =================================================================================

/**
 * 1. Cálculo del número total de paneles por balance energético (NT).
 * NT = ET / (HPS * Pp * PG)
 * @param {number} ET_requerida Energía Total requerida (Wh/día).
 * @param {number} HPS_min Hora Pico Solar mínima (kWh/m² día).
 * @param {number} Pp_panel Potencia pico del panel (Wp).
 * @param {number} Pg_perdidas Factor global de pérdidas (0.65 a 0.9).
 * @returns {number} Número total de paneles (entero, redondeado al alza).
 */
export function calcularNumeroTotalPaneles(ET_requerida, HPS_min, Pp_panel, Pg_perdidas) {
    // Usamos: ET en Wh/día, HPS en kWh/m² día, Pp_panel en Wp.
    
    if (HPS_min <= 0 || Pp_panel <= 0 || Pg_perdidas <= 0) return 0;

    // Fórmula: NT = ET_Wh / (HPS_min * 1000 * Pp_panel_kWp * Pg)
    // Simplificando la conversión: 
    // Denominador = HPS_min (kWh/m² día) * Pp_panel (Wp) * Pg 
    // Necesitamos que el denominador esté en Wh/día por Wp para ser coherente con el numerador (ET_Wh)
    // Correcto: NT = ET_Wh / (HPS_min * 1000 * Pp_panel/1000 * Pg) 
    const denominador = HPS_min * Pp_panel * Pg_perdidas;
    
    const Nt = ET_requerida / denominador;
    
    // Redondeamos hacia arriba para garantizar la cobertura de la demanda
    return Math.ceil(Nt); 
}

/**
 * 2. Cálculo del número de paneles en serie (NS).
 * NS = V_BAT / Vp
 * NOTA: Corregido el redondeo a Math.ceil() para asegurar que V_BAT sea alcanzado o superado.
 * @param {number} V_BAT Tension nominal de la batería/banco (Voltios).
 * @param {number} Vp Tension nominal del panel (Voltios).
 * @returns {number} Número de paneles en serie (entero, redondeado al alza).
 */
export function calcularPanelesEnSerie(V_BAT, Vp) {
    if (Vp <= 0) return 0;
    const Ns = V_BAT / Vp;
    return Math.ceil(Ns); // Asegura que el voltaje sea igual o mayor que V_BAT
}

/**
 * 3. Cálculo del número de ramas de paneles en paralelo (NP).
 * NP = NT / NS
 * @param {number} Nt Número total de paneles (resultado de calcularNumeroTotalPaneles).
 * @param {number} Ns Número de paneles en serie (resultado de calcularPanelesEnSerie).
 * @returns {number} Número de ramas en paralelo (entero, redondeado al alza).
 */
export function calcularRamasEnParalelo(Nt, Ns) {
    if (Ns <= 0) return Nt; 
    const Np = Nt / Ns;
    
    // Redondeamos hacia arriba para cubrir todos los paneles Nt
    return Math.ceil(Np);
}


/**
 * 4. Cálculo de la Capacidad Nominal del Banco de Baterías (Cn). (NUEVA FUNCIÓN)
 * Cn (Ah) = (D * ET) / (Vbat * Pd)
 * @param {number} ET_requeridaWh Consumo diario total (ET) en Wh/día.
 * @param {number} D_dias Días de autonomía (D).
 * @param {number} Vbat_voltios Voltaje nominal del banco de baterías (Vbat) en Voltios.
 * @param {number} Pd_descarga Profundidad máxima de descarga (Pd).
 * @returns {number} Capacidad nominal requerida en Ah, redondeada al entero superior (ceil).
 */
export function calcularCapacidadNominalBateria(ET_requeridaWh, D_dias, Vbat_voltios, Pd_descarga) {
    if (Vbat_voltios <= 0 || Pd_descarga <= 0) return 0;

    // Energía mínima requerida: Delta E = D * ET_requeridaWh
    const energiaMinimaRequeridaWh = D_dias * ET_requeridaWh;

    // Denominador: Vbat * Pd
    const denominador = Vbat_voltios * Pd_descarga;

    const Cn = energiaMinimaRequeridaWh / denominador;

    // Se redondea hacia arriba (ceil) para asegurar la cobertura de la capacidad
    return Math.ceil(Cn);
}


// =================================================================================
// === FUNCIONES DE API  ===
// =================================================================================

// Importante: La clave API está expuesta en el frontend solo para la ejecución en este entorno.
const LOCATIONIQ_API_KEY = "pk.51c19033741c68ded34031af18b8381e"; 

/**
 * Obtiene el nombre del país a partir de coordenadas usando LocationIQ.
 * @param {number} lat Latitud.
 * @param {number} lon Longitud.
 * @returns {Promise<string>} Nombre del país o mensaje de error.
 */
export async function obtenerPaisPorCoordenadas(lat, lon) {
    const url = `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_API_KEY}&lat=${lat}&lon=${lon}&format=json`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.address && data.address.country) {
            return data.address.country;
        } else if (data.error) {
            return `Error API (LocationIQ): ${data.error}`;
        } else {
            return "País no identificado.";
        }
    } catch (error) {
        return "Error de red/conexión (LocationIQ).";
    }
}

/**
 * Obtiene la Irradiación Global Diaria (Gd) en Horizontal (kWh/m² día) de Open-Meteo.
 * @param {number} lat Latitud.
 * @param {number} lon Longitud.
 * @param {number} dn Día del año (1 a 365).
 * @param {number} maxRetries Número máximo de reintentos.
 * @returns {Promise<string>} Valor de Gd en string (o mensaje de error).
 */
export async function obtenerGdOpenMeteo(lat, lon, dn, maxRetries = 3) {
    const year = 2024; 
    const date = new Date(year, 0, dn);
    const dateString = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateString}&end_date=${dateString}&daily=shortwave_radiation_sum&timezone=auto`;

    const MJ_A_KWH = 0.277778; // Conversión de MJ/m² a kWh/m²

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.reason) {
                return `Error API (OM): ${data.reason}`;
            }
            
            const value_MJ_array = data.daily?.shortwave_radiation_sum;
            
            if (value_MJ_array && value_MJ_array.length > 0) {
                const value_MJ = value_MJ_array[0];
                
                if (value_MJ !== null && value_MJ !== undefined) {
                    return (value_MJ * MJ_A_KWH).toFixed(2);
                } else {
                    return "Datos no disponibles (OM)";
                }
            } else {
                if (attempt < maxRetries - 1) throw new Error("Estructura de datos inválida (OM)");
            }

        } catch (error) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    return "Error API/Conexión (OM) - Fallo en reintentos";
}

// =================================================================================
// === DIMENSIONAMIENTO DEL REGULADOR ===
// =================================================================================

/**
 * 5. Cálculo de la Corriente generada por el campo fotovoltaico (IG).
 * IG = IpmpP * NP
 * Donde: IpmpP = Pp / VpmpP
 *
 * @param {number} Pp_panel Potencia pico del panel (Wp).
 * @param {number} VpmpP Tension nominal del panel en punto máxima potencia (Voltios).
 * @param {number} Np Número de ramas en paralelo (resultado de calcularRamasEnParalelo).
 * @returns {number} Corriente generada IG en Amperios (A).
 */
 export function calcularCorrienteGenerada(Pp_panel, VpmpP, Np) {
    if (VpmpP <= 0) return 0;
    
    // Corriente por rama en paralelo (IpmpP)
    const IpmpP = Pp_panel / VpmpP; 
    
    // Corriente generada total (IG)
    const IG = IpmpP * Np;
    
    return IG;
}

/**
 * 6. Cálculo de la Corriente consumida por las cargas (IC).
 * IC = PDC / Vbat + PAC / VAC
 *
 * NOTA: Usa 220V por defecto para VAC, siguiendo el texto de la imagen original.
 * @param {number} Pdc Potencia consumida por cargas DC (W).
 * @param {number} Vbat Tension nominal del banco de baterías (Voltios).
 * @param {number} Pac Potencia consumida por cargas AC (W).
 * @param {number} Vac Tensión de la red/inversor para cargas AC (por defecto 220V).
 * @returns {number} Corriente consumida IC en Amperios (A).
 */
export function calcularCorrienteConsumida(Pdc, Vbat, Pac, Vac = 220) {
    if (Vbat <= 0 || Vac <= 0) return 0;
    
    // Corriente por cargas DC: PDC / Vbat
    const I_DC = Pdc / Vbat;

    // Corriente por cargas AC: PAC / Vac
    const I_AC = Pac / Vac;

    return I_DC + I_AC;
}


/**
 * 7. Cálculo de la Corriente Máxima que debe soportar el Regulador (IR).
 * IR = max(IG, IC)
 *
 * @param {number} IG Corriente generada por los paneles (resultado de calcularCorrienteGenerada).
 * @param {number} IC Corriente consumida por las cargas (resultado de calcularCorrienteConsumida).
 * @returns {number} Corriente máxima del regulador IR en Amperios (A).
 */
export function calcularCorrienteRegulador(IG, IC) {
    // Se utiliza un factor de seguridad del 25% (1.25) para dimensionar comercialmente.
    const IR_Max = Math.max(IG, IC);
    
    // Se redondea al alza para el valor comercial
    return Math.ceil(IR_Max * 1.25); 
}

/**
 * Calcula la Potencia Nominal Mínima del Inversor.
 * @param {number} P_ac_w - Potencia instantánea total de cargas AC (en Watts).
 * @param {number} factor_seguridad - Factor de seguridad (ej: 1.25)
 * @returns {number} Potencia nominal mínima del inversor en W.
 */
 export function calcularInversorNominal(P_ac_w, factor_seguridad = 1.25) {
    if (P_ac_w <= 0) {
        return 0;
    }
    // La potencia del inversor debe ser ligeramente superior a P_AC
    const P_nominal_W = P_ac_w * factor_seguridad;
    
    // Devolvemos la potencia calculada para la selección
    return P_nominal_W; 
}