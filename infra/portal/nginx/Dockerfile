# Portal edge proxy: the stock unprivileged nginx (as in ai-cryoet's k8s deploy) plus the AWS
# config and the login page. Build context: infra/portal/nginx/.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# The data_portal app client id (terraform/auth output data_portal_client_id). Required.
ARG COGNITO_CLIENT_ID

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY login.html auth.js /usr/share/nginx/html/

USER root
RUN echo "$COGNITO_CLIENT_ID" | grep -Eq '^[a-z0-9]+$' \
    && sed -i "s/__COGNITO_CLIENT_ID__/$COGNITO_CLIENT_ID/" /usr/share/nginx/html/login.html \
    && chmod 644 /usr/share/nginx/html/login.html /usr/share/nginx/html/auth.js
USER 101
