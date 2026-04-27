from __future__ import annotations

from dataclasses import dataclass, asdict
from enum import Enum
import json


class Mode(str, Enum):
    STOP = "stop"
    PRODUCTION = "production"
    CIP = "cip"


@dataclass
class PlantState:
    energy_on: bool = False
    start_pressed: bool = False
    mode: Mode = Mode.STOP
    pump_milk_on: bool = False
    pump_hot_water_on: bool = False

    temp_raw_c: float = 4.0
    temp_heat_c: float = 20.0
    temp_hold_c: float = 20.0
    temp_out_c: float = 10.0
    hot_water_c: float = 90.0
    cold_water_c: float = 3.0

    flow_rate_l_min: float = 120.0
    hold_timer_s: float = 0.0
    recirculation_open: bool = False
    alarm_active: bool = False
    cip_step: int = 0
    cip_remaining_s: float = 0.0


class PasteurizationPlant:
    """
    Simplified HTST model:
    - Heat in plate section
    - Hold tube validation
    - Final cooling and recirculation logic
    """

    CIP_STEPS = [
        ("Enjuague preliminar", 120),
        ("Limpieza alcalina", 20 * 60),
        ("Enjuague intermedio", 120),
        ("Limpieza acida", 20 * 60),
        ("Enjuague final", 120),
    ]

    def __init__(self) -> None:
        self.state = PlantState()
        self._low_temp_acc_s = 0.0

    def set_energy(self, on: bool) -> None:
        self.state.energy_on = on
        if not on:
            self.state = PlantState()

    def set_start(self, pressed: bool) -> None:
        self.state.start_pressed = pressed
        if not pressed:
            self.state.mode = Mode.STOP

    def set_mode(self, mode: Mode) -> None:
        if not self.state.energy_on:
            return
        self.state.mode = mode
        if mode == Mode.CIP:
            self.state.cip_step = 0
            self.state.cip_remaining_s = float(self.CIP_STEPS[0][1])
        else:
            self.state.cip_step = 0
            self.state.cip_remaining_s = 0.0

    def set_pumps(self, milk_on: bool, hot_water_on: bool) -> None:
        self.state.pump_milk_on = milk_on and self.state.energy_on
        self.state.pump_hot_water_on = hot_water_on and self.state.energy_on

    def step(self, dt_s: float = 0.2) -> None:
        s = self.state

        if not (s.energy_on and s.start_pressed):
            return

        if s.mode == Mode.CIP:
            self._step_cip(dt_s)
            return

        if s.mode != Mode.PRODUCTION:
            return

        if s.pump_hot_water_on:
            k_heat = 0.08
            s.temp_heat_c += k_heat * (s.hot_water_c - s.temp_heat_c) * dt_s
        else:
            s.temp_heat_c += 0.02 * (s.temp_raw_c - s.temp_heat_c) * dt_s

        s.temp_hold_c = s.temp_heat_c

        if s.pump_milk_on and s.temp_hold_c >= 72.0:
            s.hold_timer_s += dt_s
        elif s.pump_milk_on:
            s.hold_timer_s = max(0.0, s.hold_timer_s - 2 * dt_s)

        valid_pasteurization = s.temp_hold_c >= 72.0 and s.hold_timer_s >= 15.0
        s.recirculation_open = not valid_pasteurization and s.pump_milk_on

        target_out = 5.0 if valid_pasteurization else 20.0
        s.temp_out_c += 0.12 * (target_out - s.temp_out_c) * dt_s

        if s.temp_hold_c < 70.0 and s.pump_milk_on:
            self._low_temp_acc_s += dt_s
        else:
            self._low_temp_acc_s = 0.0
        s.alarm_active = self._low_temp_acc_s > 8.0

    def _step_cip(self, dt_s: float) -> None:
        s = self.state
        if s.cip_step >= len(self.CIP_STEPS):
            s.mode = Mode.STOP
            s.cip_remaining_s = 0.0
            return

        s.cip_remaining_s -= dt_s
        if s.cip_remaining_s <= 0:
            s.cip_step += 1
            if s.cip_step < len(self.CIP_STEPS):
                s.cip_remaining_s = float(self.CIP_STEPS[s.cip_step][1])
            else:
                s.mode = Mode.STOP
                s.cip_remaining_s = 0.0

    def to_json(self) -> str:
        payload = asdict(self.state)
        payload["mode"] = self.state.mode.value
        if 0 <= self.state.cip_step < len(self.CIP_STEPS):
            payload["cip_step_name"] = self.CIP_STEPS[self.state.cip_step][0]
        else:
            payload["cip_step_name"] = "N/A"
        return json.dumps(payload, ensure_ascii=True)


if __name__ == "__main__":
    plant = PasteurizationPlant()
    plant.set_energy(True)
    plant.set_start(True)
    plant.set_mode(Mode.PRODUCTION)
    plant.set_pumps(milk_on=True, hot_water_on=True)

    for _ in range(150):
        plant.step(0.2)
    print(plant.to_json())
