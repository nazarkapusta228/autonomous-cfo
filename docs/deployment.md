# OpenShift deployment

The `autonomous-cfo` namespace hosts the web application, PostgreSQL 16 and the Qwen model. Sign in with `oc` before running the commands below.

## Deploy an existing project

Run the deployment script from the repository root with the desired commit checked out.

```sh
sh scripts/deploy_web.sh
```

The script applies the SQL migrations, builds the application from committed files at `HEAD`, deploys the resulting image by digest and prints the route after rollout. To diagnose a failure, inspect the relevant component.

```sh
oc -n autonomous-cfo logs -f bc/autonomous-cfo
oc -n autonomous-cfo logs deployment/autonomous-cfo
oc -n autonomous-cfo describe isvc cfo-qwen
```

## Set up a new installation

The manifests use the project name `autonomous-cfo`. They require OpenShift AI with KServe, an available NVIDIA GPU, an internal image registry and access to the model and runtime images. The settings script uses `kubectl` with the same cluster context as `oc`.

```sh
oc apply -f deploy/openshift/project.yaml
oc project autonomous-cfo
oc apply -f deploy/openshift/qwen.yaml
python scripts/create_settings.py --namespace autonomous-cfo
oc apply -f deploy/openshift/postgres.yaml
oc rollout status deployment/cfo-postgres
sh scripts/deploy_web.sh
```

Create the settings secret once for a new database. An existing persistent volume requires its original database credentials.

## Account email

Sign-up and password recovery require a working SMTP sender. Configure a verified Brevo sender with `python scripts/configure_mail.py brevo`. The script prompts for credentials, updates the delivery secret and restarts the application.

## Private email preview

Mailpit captures messages in a private inbox for local and browser tests. For a local app using the example environment settings, run the following commands and keep the port forward open.

```sh
oc -n autonomous-cfo apply -f deploy/openshift/mail-preview.yaml
oc -n autonomous-cfo port-forward deployment/cfo-mail-preview 1025:1025 8025:8025
```

Read verification codes in the [local inbox](http://localhost:8025). Messages captured by Mailpit stay in this inbox. For delivery to personal email accounts, configure a relay as described above.
