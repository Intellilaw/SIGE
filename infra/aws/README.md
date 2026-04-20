# AWS Deployment Notes

## Proposed production topology

- CloudFront serving the web build from S3
- ALB routing `/api/*` traffic to ECS Fargate tasks
- API service inside private subnets
- RDS PostgreSQL in private subnets
- Secrets Manager for app secrets
- CloudWatch metrics, logs, and alarms

## Environment variables to externalize

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `WEB_ORIGIN`
- `API_ORIGIN`
- `AWS_REGION`
- `AWS_S3_DOCUMENT_BUCKET`

## Hardening checklist

- enable HTTPS only
- attach WAF to CloudFront and ALB
- use IAM task roles instead of static AWS keys
- restrict SG ingress to ALB -> API and API -> RDS only
- rotate secrets through Secrets Manager
- enable RDS automated backups and point-in-time recovery
