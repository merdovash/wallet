# Деплой через project_hub на VPS

GitHub Action [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) по SSH выполняет:

```bash
chmod +x hub/project_hub/scripts/deploy-all.sh && ./hub/project_hub/scripts/deploy-all.sh
```

Триггеры: push в `master` или вручную (Actions → **Redeploy project_hub**).

Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_PASSPHRASE`, optional `DEPLOY_PORT`.
