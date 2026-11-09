"""Konfiguracja EMS z UI."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries

from .const import CONF_DEVICE, DEFAULT_DEVICE, DOMAIN


class EmsConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            dev = user_input[CONF_DEVICE].strip().lower()
            if self.hass.states.get(f"sensor.{dev}_bateria_soc") is None:
                errors["base"] = "no_device"
            else:
                await self.async_set_unique_id(dev)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=f"EMS ({dev})", data={CONF_DEVICE: dev})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_DEVICE, default=DEFAULT_DEVICE): str}),
            errors=errors,
        )
