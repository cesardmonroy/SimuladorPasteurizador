using System;
using UnityEngine;
using UnityEngine.Events;

public class UnityPasteurizerController : MonoBehaviour
{
    [Header("Live state (from Python or mock JSON)")]
    public TextAsset sampleStateJson;
    public PasteurizationState CurrentState = new PasteurizationState();

    [Header("Optional visual links")]
    public SpriteRenderer pipeRenderer;
    public Color coldColor = new Color(0.30f, 0.60f, 1.00f);
    public Color hotColor = new Color(1.00f, 0.40f, 0.15f);

    [Header("Events")]
    public UnityEvent<bool> OnAlarmChanged;
    public UnityEvent<float> OnTemperatureOutChanged;
    public UnityEvent<bool> OnRecirculationChanged;

    private bool _lastAlarm;
    private bool _lastRecirculation;
    private float _lastTempOut;

    public void LoadStateFromJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return;
        }
        CurrentState = JsonUtility.FromJson<PasteurizationState>(json);
        ApplyVisualsAndEvents();
    }

    public void LoadSampleState()
    {
        if (sampleStateJson != null)
        {
            LoadStateFromJson(sampleStateJson.text);
        }
    }

    private void ApplyVisualsAndEvents()
    {
        if (pipeRenderer != null)
        {
            float t = Mathf.InverseLerp(4f, 80f, CurrentState.temp_hold_c);
            pipeRenderer.color = Color.Lerp(coldColor, hotColor, t);
        }

        if (_lastAlarm != CurrentState.alarm_active)
        {
            _lastAlarm = CurrentState.alarm_active;
            OnAlarmChanged?.Invoke(_lastAlarm);
        }

        if (Mathf.Abs(_lastTempOut - CurrentState.temp_out_c) > 0.1f)
        {
            _lastTempOut = CurrentState.temp_out_c;
            OnTemperatureOutChanged?.Invoke(_lastTempOut);
        }

        if (_lastRecirculation != CurrentState.recirculation_open)
        {
            _lastRecirculation = CurrentState.recirculation_open;
            OnRecirculationChanged?.Invoke(_lastRecirculation);
        }
    }
}
