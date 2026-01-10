/**
 * @fileoverview Contiene todas las constantes y funciones matemáticas para el cálculo de radiación solar y dimensionamiento FV.
 * Incluye las funciones astronómicas, de cálculo de componentes, dimensionamiento On-Grid/Off-Grid y las llamadas a APIs externas.
 */

// === CONSTANTES FÍSICAS Y DE CONVERSIÓN ===
export const PI = Math.PI;
export const RAD_A_DEG = 180 / PI; 
export const ICS = 1367; // Constante solar en W/m²
export const FACTOR_G0D = 24 / PI; 

// =================================================================================
// === FÓRMULAS BÁSICAS ===
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
    
    if (typeof Gd_kWh === 'number' && Gd_kWh > 0 && G0d_kWh > 0) {
        
        // 1. Componente Directo (Id_beta)
        Id_beta = Id * Rb;
        if (Id_beta < 0) Id_beta = 0; 
        
        // 2. Componente Difuso (Dd_beta) - Modelo de uniformidad/isotropía simplificado (Hayek)
        const Ai = Id / G0d_kWh; 
        const anisotropyIndex = Math.max(0, Math.min(1, Ai)); 

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
// === FÓRMULAS DE DIMENSIONAMIENTO DEL SISTEMA (OFF-GRID) ===
// =================================================================================

/**
 * 1. Cálculo del número total de paneles por balance energético (NT).
 * @param {number} ET_requerida Energía Total requerida (Wh/día).
 * @param {number} HPS_min Hora Pico Solar mínima (kWh/m² día).
 * @param {number} Pp_panel Potencia pico del panel (Wp).
 * @param {number} Pg_perdidas Factor global de pérdidas (0.65 a 0.9).
 * @returns {number} Número total de paneles (entero, redondeado al alza).
 */
export function calcularNumeroTotalPaneles(ET_requerida, HPS_min, Pp_panel, Pg_perdidas) {
    if (HPS_min <= 0 || Pp_panel <= 0 || Pg_perdidas <= 0) return 0;
    const denominador = HPS_min * Pp_panel * Pg_perdidas;
    const Nt = ET_requerida / denominador;
    return Math.ceil(Nt); 
}

/**
 * 2. Cálculo del número de paneles en serie (NS).
 * @param {number} V_BAT Tension nominal de la batería/banco (Voltios).
 * @param {number} Vp Tension nominal del panel (Voltios).
 * @returns {number} Número de paneles en serie (entero, redondeado al alza).
 */
export function calcularPanelesEnSerie(V_BAT, Vp) {
    if (Vp <= 0) return 0;
    const Ns = V_BAT / Vp;
    return Math.ceil(Ns); 
}

/**
 * 3. Cálculo del número de ramas de paneles en paralelo (NP).
 * @param {number} Nt Número total de paneles.
 * @param {number} Ns Número de paneles en serie.
 * @returns {number} Número de ramas en paralelo (entero, redondeado al alza).
 */
export function calcularRamasEnParalelo(Nt, Ns) {
    if (Ns <= 0) return Nt; 
    const Np = Nt / Ns;
    return Math.ceil(Np);
}


/**
 * 4. Cálculo de la Capacidad Nominal del Banco de Baterías (Cn).
 * @param {number} ET_requeridaWh Consumo diario total (ET) en Wh/día.
 * @param {number} D_dias Días de autonomía (D).
 * @param {number} Vbat_voltios Voltaje nominal del banco de baterías (Vbat) en Voltios.
 * @param {number} Pd_descarga Profundidad máxima de descarga (Pd).
 * @returns {number} Capacidad nominal requerida en Ah, redondeada al entero superior (ceil).
 */
export function calcularCapacidadNominalBateria(ET_requeridaWh, D_dias, Vbat_voltios, Pd_descarga) {
    if (Vbat_voltios <= 0 || Pd_descarga <= 0) return 0;
    const energiaMinimaRequeridaWh = D_dias * ET_requeridaWh;
    const denominador = Vbat_voltios * Pd_descarga;
    const Cn = energiaMinimaRequeridaWh / denominador;
    return Math.ceil(Cn);
}


// =================================================================================
// === FUNCIONES DE API ===
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
 * @returns {Promise<number>} Valor de Gd en número (kWh/m² día).
 * @throws {Error} Si la API falla o no devuelve datos válidos.
 */
export async function obtenerGdOpenMeteo(lat, lon, dn, maxRetries = 3) {
    // Se utiliza un año de referencia fijo (ej: 2023) para simplificar la llamada al archivo histórico
    const year = 2023; 
    
    // Crear la fecha usando el día del año (dn)
    const date = new Date(year, 0); // Empieza en 1 de enero
    date.setDate(dn); // Ajusta la fecha al día del año (dn)
    
    // Formato YYYY-MM-DD
    const dateString = date.toISOString().split('T')[0];
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateString}&end_date=${dateString}&daily=shortwave_radiation_sum&timezone=auto`;

    // Muestra la URL en la consola para depuración
    console.log("API URL para el día", dn, ":", url); 

    const MJ_A_KWH = 0.277778; // Conversión de Megajulios/m² a kWh/m²

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                 // Si la respuesta no es 200 (ej: 400 Bad Request, 500 Server Error)
                 throw new Error(`HTTP Error ${response.status}: ${response.statusText} de Open-Meteo.`);
            }
            
            const data = await response.json();
            
            if (data.reason) {
                // Error reportado por el cuerpo de la respuesta de la API
                throw new Error(`Error API (OM): ${data.reason}`);
            }
            
            const value_MJ_array = data.daily?.shortwave_radiation_sum;
            
            if (value_MJ_array && value_MJ_array.length > 0) {
                const value_MJ = value_MJ_array[0];
                
                if (value_MJ !== null && value_MJ !== undefined) {
                    // ¡Éxito! Retornamos el valor numérico en kWh/m²
                    return value_MJ * MJ_A_KWH; 
                } else {
                    throw new Error("Datos de radiación no disponibles para esta fecha (null/undefined).");
                }
            } else {
                 // Si no hay datos, probablemente no hay cobertura para esa ubicación.
                 throw new Error("No se encontraron datos válidos de radiación en la respuesta (OM).");
            }

        } catch (error) {
            if (attempt < maxRetries - 1) {
                // Loguea el error y reintenta
                console.warn(`Intento ${attempt + 1} fallido. Reintentando...`, error.message);
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            } else {
                // Después del último intento, relanzar el error definitivo
                throw new Error(`Fallo definitivo de API: ${error.message}. Consulte la URL en la consola.`);
            }
        }
    }

    // Código inalcanzable, pero por seguridad
    throw new Error("Error API/Conexión (OM) - Fallo en reintentos.");
}

// =================================================================================
// === DIMENSIONAMIENTO DEL REGULADOR ===
// =================================================================================

/**
 * 5. Cálculo de la Corriente generada por el campo fotovoltaico (IG).
 * @param {number} Pp_panel Potencia pico del panel (Wp).
 * @param {number} VpmpP Tension nominal del panel en punto máxima potencia (Voltios).
 * @param {number} Np Número de ramas en paralelo.
 * @returns {number} Corriente generada IG en Amperios (A).
 */
export function calcularCorrienteGenerada(Pp_panel, VpmpP, Np) {
    if (VpmpP <= 0) return 0;
    const IpmpP = Pp_panel / VpmpP; 
    const IG = IpmpP * Np;
    return IG;
}

/**
 * 6. Cálculo de la Corriente consumida por las cargas (IC).
 * @param {number} Pdc Potencia consumida por cargas DC (W).
 * @param {number} Vbat Tension nominal del banco de baterías (Voltios).
 * @param {number} Pac Potencia consumida por cargas AC (W).
 * @param {number} Vac Tensión de la red/inversor para cargas AC (por defecto 220V).
 * @returns {number} Corriente consumida IC en Amperios (A).
 */
export function calcularCorrienteConsumida(Pdc, Vbat, Pac, Vac = 220) {
    if (Vbat <= 0 || Vac <= 0) return 0;
    const I_DC = Pdc / Vbat;
    const I_AC = Pac / Vac;
    return I_DC + I_AC;
}


/**
 * 7. Cálculo de la Corriente Máxima que debe soportar el Regulador (IR).
 * @param {number} IG Corriente generada por los paneles.
 * @param {number} IC Corriente consumida por las cargas.
 * @returns {number} Corriente máxima del regulador IR en Amperios (A).
 */
export function calcularCorrienteRegulador(IG, IC) {
    const IR_Max = Math.max(IG, IC);
    // Factor de seguridad del 25% (1.25)
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
    const P_nominal_W = P_ac_w * factor_seguridad;
    return P_nominal_W; 
}


// =================================================================================
// === DIMENSIONAMIENTO DEL CABLEADO ===
// =================================================================================

/**
 * 8. Cálculo de la Resistencia Óhmica (Rc) y la Potencia Perdida (Pr) por efecto Joule.
 * @param {number} I_dc Corriente continua que circula (Amperios, A).
 * @param {number} L_ida Longitud del tendido (solo un sentido) (metros, m).
 * @param {number} S_seccion Sección transversal del conductor (milímetros cuadrados, mm²).
 * @param {number} rho_resistividad Resistividad del material (Ohm·mm²/m).
 * @returns {{Rc: number, Pr: number}} Objeto con la resistencia (Ohm) y la potencia perdida (Vatios, W).
 */
export function calcularPerdidasJoule(I_dc, L_ida, S_seccion, rho_resistividad) {
    if (S_seccion <= 0 || L_ida <= 0 || I_dc <= 0 || rho_resistividad <= 0) {
        return { Rc: 0, Pr: 0 };
    }
    
    const L_total = L_ida * 2; 
    const Rc = (rho_resistividad * L_total) / S_seccion;
    const Pr = Math.pow(I_dc, 2) * Rc;

    return {
        Rc: Rc,
        Pr: Pr
    };
}