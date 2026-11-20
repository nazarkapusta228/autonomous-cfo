#!/bin/sh
set -eu
namespace=autonomous-cfo
archive_dir=$(mktemp -d)
trap 'rm -rf "$archive_dir"' EXIT
git archive --format=tar.gz -o "$archive_dir/source.tgz" HEAD Dockerfile pyproject.toml src/cfo data/sample view

git archive HEAD sql deploy/openshift | tar -x -C "$archive_dir"
for migration in "$archive_dir"/sql/*.sql; do
    oc -n "$namespace" exec -i deployment/cfo-postgres -- sh -c \
        'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U cfo -d cfo' < "$migration"
done

oc -n "$namespace" apply -f "$archive_dir/deploy/openshift/build.yaml"
build=$(oc -n "$namespace" start-build autonomous-cfo --from-archive="$archive_dir/source.tgz" -o name)
oc -n "$namespace" logs -f "$build"
oc -n "$namespace" wait --for=jsonpath='{.status.phase}'=Complete "$build" --timeout=15m
digest=$(oc -n "$namespace" get "$build" -o jsonpath='{.status.output.to.imageDigest}')
test -n "$digest"
image="image-registry.openshift-image-registry.svc:5000/$namespace/autonomous-cfo@$digest"
sed "s|IMAGE_REPLACE_BEFORE_DEPLOY|$image|" "$archive_dir/deploy/openshift/app.yaml" > "$archive_dir/app.yaml"
oc -n "$namespace" apply -f "$archive_dir/app.yaml"
oc -n "$namespace" rollout status deployment/autonomous-cfo --timeout=5m
oc -n "$namespace" get route autonomous-cfo -o jsonpath='https://{.spec.host}{"\n"}'
