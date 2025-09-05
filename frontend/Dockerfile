FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy application files
COPY . /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S nginx
RUN adduser -S nginx -u 1001

# Change ownership
RUN chown -R nginx:nginx /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx
RUN chown -R nginx:nginx /var/log/nginx
RUN chown -R nginx:nginx /etc/nginx/conf.d
RUN touch /var/run/nginx.pid
RUN chown -R nginx:nginx /var/run/nginx.pid

USER nginx

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]