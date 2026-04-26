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
- `WEB_ORIGINS`
- `API_ORIGIN`
- `AWS_REGION`
- `AWS_S3_DOCUMENT_BUCKET`
- `PASSWORD_RESET_EXPOSE_PREVIEW=false`

## Hardening checklist

- enable HTTPS only
- attach WAF to CloudFront and ALB
- use IAM task roles instead of static AWS keys
- restrict SG ingress to ALB -> API and API -> RDS only
- rotate secrets through Secrets Manager
- enable RDS automated backups and point-in-time recovery
- do not enable development reset-link previews in AWS environments

## Create the first PostgreSQL database

For the first migration, prefer a small RDS PostgreSQL instance before Aurora. It is simpler and cheaper to validate the data move, and the app can later move to Aurora with a standard PostgreSQL migration.

Template:

- [rds-postgres.yaml](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/infra/aws/rds-postgres.yaml)

The AWS identity running the command needs permissions for CloudFormation, RDS, EC2 networking lookups, security groups, Secrets Manager if used, and tagging. The current deploy user must at least be able to call:

- `cloudformation:*` for this stack
- `rds:CreateDBInstance`, `rds:DescribeDBInstances`, `rds:CreateDBSubnetGroup`, `rds:AddTagsToResource`
- `ec2:DescribeVpcs`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`

The scoped policy for this is available at:

- [iam-rds-provisioning-policy.json](C:/Users/edrus/Dropbox/2%20Intellilaw/SIGE_2/infra/aws/iam-rds-provisioning-policy.json)

Attach it to `voicefirst-deploy` from an administrator AWS session:

```powershell
aws iam put-user-policy `
  --user-name voicefirst-deploy `
  --policy-name SigeRdsProvisioning `
  --policy-document file://infra/aws/iam-rds-provisioning-policy.json
```

Example command once you have a VPC, at least two subnet ids, and a strong password:

```powershell
aws cloudformation deploy `
  --stack-name sige-postgres `
  --template-file infra\aws\rds-postgres.yaml `
  --parameter-overrides `
    EnvironmentName=sige `
    VpcId=vpc-xxxxxxxx `
    DBSubnetIds=subnet-aaaaaaaa,subnet-bbbbbbbb `
    AllowedCidr=10.0.0.0/8 `
    DBName=sige_2 `
    DBUsername=sige_admin `
    DBPassword="REPLACE_WITH_A_LONG_SECRET" `
    PubliclyAccessible=false
```

After the stack finishes, get the endpoint:

```powershell
aws cloudformation describe-stacks `
  --stack-name sige-postgres `
  --query "Stacks[0].Outputs" `
  --output table
```

Then build `DATABASE_URL`:

```powershell
$env:DATABASE_URL="postgresql://sige_admin:REPLACE_WITH_A_LONG_SECRET@RDS-ENDPOINT:5432/sige_2?schema=public&sslmode=require"
npm.cmd run db:migrate:deploy --workspace @sige/api
```
