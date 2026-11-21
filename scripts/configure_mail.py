"""Configure the OpenShift relay for account emails. Run from a signed-in oc terminal."""

import argparse
import base64
import getpass
import json
import subprocess

NAMESPACE = "autonomous-cfo"
SENDER = "autonomous.cfo@gmail.com"
DEPLOYMENT = "deployment/autonomous-cfo"


def configure(provider):
    oc = ["oc", "-n", NAMESPACE]
    subprocess.run([*oc, "get", DEPLOYMENT, "-o", "name"], check=True)
    if provider == "gmail":
        host, sender, login = "smtp.gmail.com", SENDER, SENDER
        password = getpass.getpass("Google app password: ").replace(" ", "")
    else:
        host = "smtp-relay.brevo.com"
        sender = input("Sender address verified in Brevo: ").strip()
        login = input("Brevo SMTP login: ").strip()
        password = getpass.getpass("Brevo SMTP key: ").strip()
    if not (sender and login and password):
        raise SystemExit("Sender, SMTP login and SMTP credential are required.")
    settings = {
        "SMTP_HOST": host,
        "SMTP_PORT": "587",
        "SMTP_TLS": "starttls",
        "SMTP_FROM": sender,
        "SMTP_USERNAME": login,
        "SMTP_PASSWORD": password,
        "SMTP_PREVIEW_INBOX_URL": "",
    }
    secret = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "cfo-mail-delivery", "namespace": NAMESPACE},
        "type": "Opaque",
        "data": {k: base64.b64encode(v.encode()).decode() for k, v in settings.items()},
    }
    subprocess.run(
        [*oc, "apply", "--server-side", "--field-manager=cfo-mail", "-f", "-"],
        input=json.dumps(secret).encode(),
        check=True,
    )
    subprocess.run([*oc, "rollout", "restart", DEPLOYMENT], check=True)
    subprocess.run([*oc, "rollout", "status", DEPLOYMENT, "--timeout=5m"], check=True)
    # Check the actual pod's TLS connection and credentials without sending a code.
    probe = """
import os, smtplib, ssl, sys
if os.environ.get("SMTP_HOST") != sys.argv[1] or os.environ.get("SMTP_FROM") != sys.argv[2]:
    sys.exit("The running deployment did not load the selected mail settings.")
with smtplib.SMTP(sys.argv[1], 587, timeout=15) as smtp:
    smtp.starttls(context=ssl.create_default_context())
    smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
print("SMTP authentication succeeded from OpenShift.")
"""
    subprocess.run([*oc, "exec", DEPLOYMENT, "--", "python", "-c", probe, host, sender], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=["gmail", "brevo"])
    configure(parser.parse_args().provider)
