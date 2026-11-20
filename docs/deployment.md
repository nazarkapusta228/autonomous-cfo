# Середовище команди в OpenShift AI

У проєкті `autonomous-cfo` працюють KServe InferenceService `cfo-qwen` (Qwen2.5-7B-Instruct,
vLLM, NVIDIA L4) і PostgreSQL 16 `cfo-postgres` із PVC. Образ Python 3.12 для
агентів збирається в ImageStream `autonomous-cfo:agent`. Обидва агенти доступні як
Python API та як команди в цьому образі. Власник UI може використати той самий
образ і Secret `cfo-settings` для свого Deployment.

Для команд нижче увійдіть через `oc login` у кластер команди. Скопіювати команду
входу можна з вебконсолі. Виконуйте команди з кореня репозиторію.

```sh
oc project autonomous-cfo
oc get isvc cfo-qwen
oc get pod,pvc,svc
oc create -f deploy/openshift/agent-run.yaml
```

Остання команда запускає **один** агентний аналіз демовиписки. Вивід доступний через
`oc logs -f job/<видана-назва>`. Рекомендація зберігається в PostgreSQL. Повтор
після збою того самого Job використовує той самий UUID. Новий Job створює новий аналіз.

У кластері endpoint — `http://cfo-qwen-predictor:8080/v1` у проєкті
`autonomous-cfo`, served model — `Qwen/Qwen2.5-7B-Instruct`. Адреса використовує
порт процесу vLLM: predictor Service є headless. Кластерний пароль БД зберігається
в Secret. Для фінального UI доступний окремий шаблон `app.yaml`: команді UI потрібно
підставити digest образу зі своїм інтерфейсом і застосувати його, щоб відкрити Route.

## Локальний PyCharm із тією самою моделлю

Після входу в кластер залиште цей процес у відкритому терміналі:

```sh
oc -n autonomous-cfo port-forward --address=127.0.0.1 deployment/cfo-qwen-predictor 18481:8080
```

У локальному `.env` використайте `LLM_BASE_URL=http://127.0.0.1:18481/v1`
і значення `LLM_MODEL` з прикладу. `DATABASE_URL` з `.env.example` веде на локальну
БД з Compose. У PyCharm оберіть модуль `cfo.cli`, аргументи `run liquidity` або
`run investment`. Погодження та перегляд працюють у тій БД, яка налаштована для цього запуску.

## Відтворення розгортання

1. Застосуйте `deploy/openshift/project.yaml`, оберіть проєкт і застосуйте `qwen.yaml`.
   Маніфест використовує Red Hat modelcar для Qwen та встановлену в командному кластері версію
   vLLM. Для нього потрібен один вільний GPU. Наша конфігурація використовує контекст 4096.
2. Створіть нові реквізити для порожньої БД через
   `python scripts/create_settings.py --namespace autonomous-cfo` (потрібен kubectl).
   Secret створюють один раз. Для наявного PVC зберігайте відповідний йому пароль.
3. Застосуйте `postgres.yaml`. Після готовності PostgreSQL накладіть міграції:

   ```sh
   oc rollout status deployment/cfo-postgres
   for f in sql/*.sql; do
     oc exec -i deployment/cfo-postgres -- sh -c 'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U cfo -d cfo' < "$f" || break
   done
   ```

4. Застосуйте BuildConfig та зберіть вихідні файли у внутрішній registry.
   Архів використовує відстежувані Git-файли з останнього коміту робочої гілки.

   ```sh
   oc apply -f deploy/openshift/build.yaml
   git archive -o /tmp/cfo-build.tar.gz HEAD Dockerfile pyproject.toml app.py .streamlit/config.toml src/cfo data/sample
   oc start-build autonomous-cfo --from-archive=/tmp/cfo-build.tar.gz --follow
   oc create -f deploy/openshift/agent-run.yaml
   ```

## Спільний GPU

Для запуску Qwen демосервіс `my-first-model/llama-32-3b-instruct` призупинено через
анотацію KServe. Обидві моделі зберігають свої конфігурації. Якщо команда пізніше
вирішить повернути GPU демомоделі:

```sh
oc -n autonomous-cfo annotate isvc cfo-qwen serving.kserve.io/stop=true --overwrite
oc -n my-first-model annotate isvc llama-32-3b-instruct serving.kserve.io/stop=false --overwrite
```

Кластер одночасно обслуговує одну з цих моделей. [Картка Qwen](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct),
[Red Hat OpenShift AI Model Serving](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/deploying_models/index).
