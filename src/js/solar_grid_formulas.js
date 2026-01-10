/**
 * solar_grid_formulas.js
 * Contiene las funciones específicas para el dimensionamiento de sistemas 
 * fotovoltaicos Conectados a Red .
 */

// =========================================================================
// 1. Dimensionamiento de Potencia Pico (kWp) - FÓRMULA BASE
// =========================================================================

/**
 * Calcula la Potencia Pico requerida (Ppico) para cubrir el consumo anual.
 * NOTA: Esta función requiere que HSP_anual esté en kWh/m²/año.
 * @param {number} consumoAnual_kWh Consumo energético anual total (kWh/año).
 * @param {number} HSP_anual Horas Solares Pico anuales (kWh/m²/año).
 * @param {number} factorRendimiento Factor de rendimiento del sistema (ej: 0.80).
 * @returns {number} Potencia Pico Requerida en kWp.
 */
 export function calcularPotenciaPico(consumoAnual_kWh, HSP_anual, factorRendimiento) {
    if (HSP_anual <= 0 || factorRendimiento <= 0) {
        throw new Error("HSP Anual y Rendimiento deben ser mayores que cero.");
    }
    
    // Fórmula: Ppico (kWp) = Consumo Anual (kWh/año) / [ HSP Anual (kWh/m²/año) * Rendimiento ]
    const potenciaPico_kWp = consumoAnual_kWh / (HSP_anual * factorRendimiento);
    return potenciaPico_kWp;
}

// =========================================================================
// 2. Dimensionamiento de Módulos
// =========================================================================

/**
 * Calcula el número de módulos solares necesarios.
 * @param {number} potenciaPico_kWp Potencia Pico requerida (kWp).
 * @param {number} potenciaModulo_Wp Potencia nominal de un solo módulo (Wp).
 * @returns {number} Número entero de módulos.
 */
export function calcularNumeroModulos(potenciaPico_kWp, potenciaModulo_Wp) {
    if (potenciaModulo_Wp <= 0) {
        throw new Error("La potencia del módulo debe ser mayor que cero.");
    }

    // Convertir la potencia Pico total de kWp a Wp
    const potenciaPico_Wp = potenciaPico_kWp * 1000;

    // Número de módulos (siempre redondeado hacia arriba)
    const numModulosFloat = potenciaPico_Wp / potenciaModulo_Wp;
    return Math.ceil(numModulosFloat);
}

// =========================================================================
// 3. Dimensionamiento del Inversor (AC)
// =========================================================================

/**
 * Dimensiona la potencia mínima del inversor (nominal).
 * Se utiliza un factor de sobredimensionamiento DC/AC para considerar pérdidas.
 * @param {number} potenciaPico_kWp Potencia Pico requerida (kWp).
 * @returns {number} Potencia nominal mínima del inversor en kW.
 */
export function dimensionarInversor(potenciaPico_kWp) {
    // Factor de sobredimensionamiento DC/AC típico (ej. 1.25). 
    // Si la potencia DC es 1.25 veces la potencia AC del inversor, el inversor será 1/1.25 = 0.80
    // Usaremos un factor simple de 0.85 para dimensionar la potencia AC del inversor.
    const factorRatioDCAC = 1; 

    // Potencia Inversor (AC) = Potencia Pico (DC) * Factor de Ratio
    const potenciaInversor_kW = potenciaPico_kWp * factorRatioDCAC; 
    
    return potenciaInversor_kW;
}

// =========================================================================
// 4. FUNCIÓN CENTRAL DE DIMENSIONAMIENTO  (CON CONVERSIÓN)
// =========================================================================

/**
 * Función principal para el dimensionamiento completo .
 * Maneja la conversión de unidades de GiAnualMWh a HSP_anual (kWh/m²/año).
 * * @param {number} consumoAnual_kWh Consumo energético anual total (kWh/año).
 * @param {number} GiAnualMWh Radiación Inclinada Anual (MWh/m²/año) desde solar_radiation_core.
 * @param {number} factorRendimiento Factor de rendimiento del sistema (ej: 0.80).
 * @param {number} potenciaModulo_Wp Potencia nominal de un solo módulo (Wp).
 * @param {number} anguloOptimo Ángulo de inclinación óptimo (para mostrar en resultados).
 * @returns {object} Resultados del dimensionamiento.
 */
export function dimensionarSistemaOnGrid(
    consumoAnual_kWh, 
    GiAnualMWh, 
    factorRendimiento, 
    potenciaModulo_Wp, 
    anguloOptimo = 0
) {

    // 1. CONVERSIÓN DE UNIDADES (MWh/m² a kWh/m² - HSP Anual)
    // -----------------------------------------------------------
    if (GiAnualMWh <= 0) {
        throw new Error("El valor de Radiación Anual (GiAnualMWh) debe ser positivo. Verifica la API.");
    }
    
    // HSP Anual (kWh/m²/año) = GiAnualMWh (MWh/m²/año) * 1000
    const HSP_anual = GiAnualMWh * 1000; 

    // 2. CÁLCULO DE POTENCIA PICO (kWp)
    // -----------------------------------------------------------
    const potenciaPico_kWp = calcularPotenciaPico(
        consumoAnual_kWh, 
        HSP_anual, 
        factorRendimiento
    );

    // 3. CÁLCULO DEL NÚMERO DE MÓDULOS
    // -----------------------------------------------------------
    const numModulos = calcularNumeroModulos(potenciaPico_kWp, potenciaModulo_Wp);
    
    // 4. DIMENSIONAMIENTO DEL INVERSOR
    // -----------------------------------------------------------
    const potenciaInversor_kW = dimensionarInversor(potenciaPico_kWp);

    return {
        potenciaPico_kWp: parseFloat(potenciaPico_kWp.toFixed(2)),
        numModulos: numModulos,
        potenciaInversor_kW: parseFloat(potenciaInversor_kW.toFixed(2)),
        HSP_anual_calculada_kWh: parseFloat(HSP_anual.toFixed(2)),
        anguloOptimo: anguloOptimo
    };
}