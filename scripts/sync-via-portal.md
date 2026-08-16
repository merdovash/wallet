# Деплой через project_hub на VPS

GitHub Action [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) по SSH:

```bash
cd "$DEPLOY_PATH"
chmod +x scripts/deploy-all.sh && ./scripts/deploy-all.sh
```

Триггеры: push в `master` или вручную (Actions → **Redeploy project_hub**).

Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_PASSPHRASE`, `DEPLOY_PATH` (абсолютный путь к `project_hub`, например `/root/hub/project_hub`), optional `DEPLOY_PORT`.

Убедитесь, что `DEPLOY_USER` имеет доступ к этому каталогу (если хаб лежит в `/root/...`, либо поставьте `DEPLOY_USER=root`, либо перенесите/склонируйте хаб в home деплой-пользователя).
