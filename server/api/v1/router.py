"""Aggregates every v1 router."""

from fastapi import APIRouter

from api.v1.endpoints import devices, events, hotspot, monitoring, network, system

api_router = APIRouter()
api_router.include_router(hotspot.router)
api_router.include_router(network.router)
api_router.include_router(devices.router)
api_router.include_router(monitoring.router)
api_router.include_router(events.router)
api_router.include_router(system.router)
