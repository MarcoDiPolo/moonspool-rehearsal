"""Install and exercise the app through a real isolated Kiro Crew release gateway."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

from kiro_crew.apps.manifest import AppManifest
from kiro_crew.testing.harness import spawn_feature_gateway

ROOT = Path(__file__).resolve().parents[1]


def check(gateway):
    subprocess.run(
        ["node", str(ROOT / "test" / "crew_page.cjs")],
        input=json.dumps({"port": gateway.port, "url": gateway.url}),
        text=True, check=True, timeout=120,
    )


if __name__ == "__main__":
    os.environ["KIROCREW_TELEMETRY_DISABLED"] = "1"
    os.environ["KIRO_DISABLE_TELEMETRY"] = "1"
    os.environ["DO_NOT_TRACK"] = "1"
    manifest = AppManifest.from_json_file(ROOT / "app.json")
    assert manifest.validate(ROOT) == []
    print("Official manifest validation passed.", flush=True)
    with spawn_feature_gateway(fixture="minimal", approval="interactive", crons=False, timeout=135) as session:
        print("Official dashboard listening on loopback.", flush=True)
        try:
            check(session)
        finally:
            # Ask this profile's own gateway to exit before the Windows test
            # harness falls back to timing out on taskkill's process-tree scan.
            env = dict(os.environ, KIROCREW_HOME=str(session.home), KIRO_HOME=str(session.home / "kiro"))
            subprocess.run([
                sys.executable, "-c",
                "from kiro_crew.cli_server_stop import _request_gateway_shutdown as stop; "
                "import sys; sys.exit(0 if stop(int(sys.argv[1])) else 1)",
                str(session.port),
            ], env=env, check=True, timeout=30)
            session.proc.wait(timeout=65)
    for attempt in range(30):
        with socket.socket() as sock:
            sock.settimeout(0.25)
            if sock.connect_ex(("127.0.0.1", session.port)) != 0:
                break
        time.sleep(0.25)
    else:
        raise RuntimeError("The test gateway is still listening.")
    print("Gateway process exited and its loopback port closed.", flush=True)
