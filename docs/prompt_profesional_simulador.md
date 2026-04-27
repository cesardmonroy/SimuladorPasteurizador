Rol: Eres un ingeniero senior en simuladores industriales de procesos termicos alimentarios (HTST) con experiencia en plantas de leche, gemelos digitales, HMI/SCADA, Python, C#, Unity y validacion sanitaria.

Objetivo:
Construir un simulador de pasteurizacion de leche tipo intercambiador de calor por placas, basado en la guia tecnica de planta VIGLAC y en la interfaz visual de referencia. El simulador debe ser didactico pero tecnicamente coherente para entrenamiento operativo.

Alcance funcional minimo:
1) Flujo de proceso:
- Entrada de leche cruda al tanque de balance.
- Bombeo al intercambiador de placas.
- Calentamiento con agua caliente de calderin hasta rango de pasteurizacion (72 +/- 2 C).
- Retencion termica de 15 a 22 segundos.
- Enfriamiento final a 4-6 C.
- Si no se alcanza temperatura minima, activar valvula de desvio y recircular al tanque.

2) Logica de operacion:
- Botones: energia general, bomba agua caliente, bomba leche, modo lavado/produccion, inicio/parada.
- Indicadores: estado de bombas, estado de valvulas, temperatura de calentamiento, temperatura de salida, tiempo de retencion, alarma.
- Enclavamientos: no iniciar produccion sin energia general y sin preacondicion termico.

3) Modo CIP:
- Secuencia de 5 etapas:
  a) enjuague preliminar 65-70 C
  b) limpieza alcalina 20 min (NaOH 2%, 65-70 C)
  c) enjuague intermedio 65-72 C
  d) limpieza acida 20 min (HNO3 1-1.5%, 35-40 C)
  e) enjuague final con pH objetivo 6.5-7.0
- Registrar etapa actual, tiempo restante y condiciones objetivo.

4) Modelo dinamico simplificado:
- Variables de estado:
  T_raw, T_heat, T_hold, T_out, flow_rate, hold_timer, recirculation_open, mode, alarm_state.
- Ecuaciones discretas por paso de simulacion dt:
  T_heat <- T_heat + k_heat * (T_hot_water - T_heat) * dt
  T_out <- T_out + k_cool * (T_cold_water - T_out) * dt
  hold_timer acumula mientras T_hold >= 72 C
- Criterio de pasteurizacion valida:
  (T_hold >= 72 C) AND (hold_timer >= 15 s)
- Criterio de alarma:
  T_hold < 70 C en produccion por mas de umbral configurado.

5) Arquitectura de software:
- Python: motor de simulacion y reglas de proceso.
- C#: capa de integracion para Unity (lectura de estado, actualizacion visual, eventos UI).
- Frontend 2D inicial: HTML/CSS/JS con diagrama interactivo y panel de control.

6) Salidas esperadas:
- Simulador interactivo que permita:
  - arrancar/parar
  - alternar modo CIP/Produccion
  - visualizar recorrido de fluido por color/animacion
  - observar temperaturas y alarmas en tiempo real
- Estructura portable a Unity:
  - estado serializable (JSON)
  - API de eventos (OnPumpChanged, OnTemperatureChanged, OnAlarm)

7) Criterios de calidad:
- Coherencia de parametros con guia tecnica:
  - pasteurizacion 72 +/- 2 C
  - retencion 15-22 s
  - salida 4-6 C
- Interfaz clara para entrenamiento.
- Codigo modular y documentado.
- Facil de ampliar a escenarios de falla.

Instrucciones de implementacion:
- Priorizar legibilidad y modularidad.
- Incluir archivos de ejemplo en Python, C# y web 2D.
- Entregar tambien una breve guia para migrar la vista web a Unity (UI Canvas o sprites 2D).
