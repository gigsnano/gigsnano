from typing import Literal

from pydantic import BaseModel, Field


class DeviceIn(BaseModel):
    token: str = Field(max_length=200, pattern=r"^Expo(nent)?PushToken\[.+\]$")
    platform: Literal["ios", "android"]
    device_name: str = Field(default="", max_length=120)


class DeviceOut(BaseModel):
    id: str
    platform: str
    device_name: str


class PushPreferencesOut(BaseModel):
    realtime: bool
    briefing: bool


class PushPreferencesUpdate(BaseModel):
    realtime: bool | None = None
    briefing: bool | None = None
