# Simulador de Pasteurizacion HTST (Base Python + C# + Web 2D)

Este proyecto crea una base funcional para un simulador de pasteurizacion de leche, alineado con la guia tecnica suministrada.

## Estructura

- `docs/prompt_profesional_simulador.md`: prompt tecnico para seguir iterando el simulador.
- `python/pasteurization_model.py`: motor simplificado de proceso (estado + reglas).
- `web/index.html`, `web/styles.css`, `web/app.js`: interfaz 2D interactiva para pruebas.
- `csharp/PasteurizationState.cs`: estado serializable.
- `csharp/UnityPasteurizerController.cs`: controlador para mapear estado al frontend de Unity.

## Como ejecutar la vista 2D web

1. Abrir `web/index.html` en un navegador.
2. Encender `Energia`, luego `Start`.
3. Activar bombas y alternar entre `Produccion` y `CIP`.

## Parametros del proceso implementados

- Pasteurizacion valida: `T_hold >= 72 C` y `tiempo >= 15 s`.
- Retorno por desviacion: si no cumple criterio de pasteurizacion.
- Enfriamiento final objetivo: `4-6 C` (aproximado a 5 C en el modelo).
- Alarma por baja temperatura: `T_hold < 70 C` sostenida en produccion.

## Carga de visual a Unity

Ruta recomendada para Unity:

1. Crear escena 2D y panel HMI (Canvas + UI Toolkit o UGUI).
2. Conectar botones UI a un script de control del simulador.
3. Recibir el estado del motor Python como JSON (socket local, REST o archivo temporal).
4. Deserializar con `PasteurizationState`.
5. Alimentar `UnityPasteurizerController.LoadStateFromJson(json)`.
6. Mapear temperaturas/estados a sprites, colores de tuberia y textos.

## Siguiente iteracion sugerida

- Integrar historico de tendencias (temperatura/flujo).
- Añadir fallas simuladas (bomba, valvula, falta de vapor, falla de frio).
- Incorporar protocolos de registro (limpieza CIP y lote pasteurizado).
