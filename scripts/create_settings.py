"""Create this namespace's initial CFO Secret without writing credentials to disk."""

import argparse
import json
import secrets
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--namespace", required=True)
    args = parser.parse_args()
    password = secrets.token_urlsafe(32)
    secret = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "cfo-settings", "namespace": args.namespace},
        "type": "Opaque",
        "stringData": {
            "POSTGRESQL_PASSWORD": password,
            "DATABASE_URL": f"postgresql://cfo:{password}@cfo-postgres:5432/cfo",
            "LLM_BASE_URL": "http://cfo-qwen-predictor:8080/v1",
            "LLM_MODEL": "Qwen/Qwen2.5-7B-Instruct",
        },
    }
    # create (not apply) preserves the database password on a repeat invocation.
    subprocess.run(
        ["kubectl", "create", "-f", "-"], input=json.dumps(secret), text=True, check=True
    )


if __name__ == "__main__":
    main()
