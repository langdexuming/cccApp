from app.adapters.trainer.base import BaseTrainerAdapter, PreparedRun, RunContext
from app.adapters.trainer.llamafactory import LLaMAFactoryTrainerAdapter
from app.adapters.trainer.swift import SwiftTrainerAdapter


def get_trainer_adapter(name: str) -> BaseTrainerAdapter:
    normalized = name.lower()
    if normalized == "llamafactory":
        return LLaMAFactoryTrainerAdapter()
    if normalized == "swift":
        return SwiftTrainerAdapter()
    raise ValueError(f"Unsupported trainer backend: {name}")


__all__ = [
    "BaseTrainerAdapter",
    "PreparedRun",
    "RunContext",
    "LLaMAFactoryTrainerAdapter",
    "SwiftTrainerAdapter",
    "get_trainer_adapter",
]
