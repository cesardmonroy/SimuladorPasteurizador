using System;

[Serializable]
public class PasteurizationState
{
    public bool energy_on;
    public bool start_pressed;
    public string mode = "stop";
    public bool pump_milk_on;
    public bool pump_hot_water_on;
    public float temp_raw_c;
    public float temp_heat_c;
    public float temp_hold_c;
    public float temp_out_c;
    public float flow_rate_l_min;
    public float hold_timer_s;
    public bool recirculation_open;
    public bool alarm_active;
    public int cip_step;
    public float cip_remaining_s;
    public string cip_step_name = "N/A";
}
