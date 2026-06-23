FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV CI=true \
    TZ=Asia/Bangkok \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN mkdir -p test-results playwright-report screenshots

CMD ["sh", "scripts/run-docker-tests.sh"]
