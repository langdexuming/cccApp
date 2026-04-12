from __future__ import annotations

import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = REPO_ROOT / "runtime" / "sqlite" / "app.db"


NAME_UPDATES = {
    "baseline-report-smoke": "告警诊断基线报告验证任务",
    "baseline-log-smoke": "告警诊断基线日志验证任务",
    "llamafactory-qwen35-2b-sft-modelscope": "Qwen3.5-2B 告警诊断监督微调训练（ModelScope）",
    "llamafactory-qwen35-2b-sft-smoke": "Qwen3.5-2B 告警诊断监督微调冒烟训练",
    "baseline-alarm-eval-v1": "Qwen3.5-2B 告警诊断基线评测任务",
}

SWIFT_9B_BASE_NAME = "Qwen3.5-9B-Base 告警诊断 ms-swift 预适配训练"

ID_UPDATES = {
    "exp_20260412_054530_3557cc": "告警诊断基线报告验证任务",
    "exp_20260412_054324_39cf79": "告警诊断基线日志验证任务",
    "exp_20260412_053225_d26c30": "Qwen3.5-2B 告警诊断监督微调训练（ModelScope）",
    "exp_20260412_052753_6ddd42": "Qwen3.5-2B 告警诊断监督微调冒烟训练",
    "exp_20260412_045619_bf78f1": "Qwen3.5-2B 告警诊断基线评测任务",
    "exp_20260412_045434_8cc0f5": "Qwen3.5-2B 告警诊断基线评测任务",
    "exp_20260412_045203_6e1500": "Qwen3.5-2B 告警诊断基线评测任务",
}


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    for old_name, new_name in NAME_UPDATES.items():
        cur.execute("update experiment set name = ? where name = ?", (new_name, old_name))

    for experiment_id, new_name in ID_UPDATES.items():
        cur.execute("update experiment set name = ? where id = ?", (new_name, experiment_id))

    cur.execute(
        """
        update experiment
           set name = ?
         where trainer_backend = 'swift'
           and base_model = 'Qwen/Qwen3.5-9B-Base'
        """,
        (SWIFT_9B_BASE_NAME,),
    )

    conn.commit()

    rows = list(
        cur.execute(
            "select id, name from experiment order by created_at desc limit 20"
        )
    )
    for row in rows:
        escaped = row[1].encode("unicode_escape").decode("ascii")
        print(f"{row[0]} => {escaped}")

    conn.close()


if __name__ == "__main__":
    main()
