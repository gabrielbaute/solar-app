# SOLARVEN23 - Aplicación Web

SOLARVEN23 es una plataforma integral para el diseño de ingeniería solar, compuesta por dos módulos principales: **Sistema Autónomo** y **Sistema Conectado a la Red**.

---

## 1. Módulo: Sistema Autónomo (Off-Grid)
Este módulo está diseñado para garantizar la soberanía energética mediante la gestión de almacenamiento en baterías y la optimización del generador según el recurso solar local.

### Características Principales:
- **Cálculo Astronómico:** Determina la inclinación óptima y la irradiancia basándose en coordenadas geográficas (Lat/Long).
- **Gestión de Cargas:** Tabla de dispositivos con discriminación de eficiencia de batería ($\beta_{BAT}$) e inversor ($\beta_{INV}$).
- **Motor de Radiación:** Generación de gráficos de irradiancia ($G_i$) mediante Chart.js.

### Metodología Matemática Aplicada:
1. **Consumo Ajustado ($E_T$):** $$E_T = \frac{\sum (P \cdot t \cdot Cantidad)}{\eta_{bat} \cdot \eta_{inv}}$$
2. **Capacidad del Banco de Baterías ($C_n$):** $$C_n (Ah) = \frac{E_T \cdot D}{V_{bat} \cdot P_d}$$
   *(ID HTML: `input-autonomia` ($D$), `input-pd` ($P_d$))*
3. **Configuración de Matriz:** - $N_s$ (Paneles en serie) = `input-vbat` / `input-vp`
   - $N_p$ (Ramas en paralelo) = $N_t / N_s$



---

## 2. Módulo: Sistema Conectado a la Red (On-Grid)
Este módulo se enfoca en el calculo de sistemas sin la necesidad de la utilización de baterias.

### Metodología de Cálculo:
* **Consumo Anual Acumulado ($E_{anual}$):**
    $$E_{anual} = \sum (\frac{P_{inst} \cdot Cantidad \cdot Horas \cdot 365}{1000})$$
* **Potencia Pico Requerida ($P_{dc}$):** Basada en la compensación del consumo anual y el Performance Ratio ($\eta$):
    $$P_{dc} = \frac{E_{anual}}{HSP_{anual} \cdot \eta}$$
* **Interconexión AC:**
    * **Protección (Breaker):** $I_{breaker} = (\frac{P_{inv}}{V_{red}}) \cdot 1.25$
    * **Sección de Cable AC:** Calculada mediante la Ley de Ohm para limitar la caída de tensión ($\Delta V$) al 1%, 2% o 3% según selección del usuario.

---

## 3. Arquitectura del Proyecto
El software utiliza una estructura modular para facilitar el mantenimiento:

- `/index.html`: Interfaz del Sistema Autónomo.
- `/red.html`: Interfaz del Sistema Conectado a Red.
- `/solar_formulas.js`: Librería de fórmulas físicas comunes.
- `/main_script.js`: Lógica de orquestación y eventos reactivos.

## 4. Estándares Técnicos Aplicados
- **Irradiancia:** Modelo de geometría solar (Declinación y Ángulo Horario).
- **Conductores:** Basado en resistividad del cobre y Ley de Ohm.
- **Seguridad:** Factor de seguridad del 25% en componentes de potencia (Reguladores/Inversores).