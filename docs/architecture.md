# SIGE_2 Target Architecture

## Stack decisions

### Backend

- Fastify + TypeScript
- Zod for request validation
- JWT access tokens plus refresh-token rotation
- Prisma targeting PostgreSQL on AWS RDS
- modular services with shared contracts

Why:

- Fastify is lightweight, fast, and well-suited to stateless horizontal scaling.
- Prisma gives a clean path from local development to AWS RDS / Aurora PostgreSQL.
- Zod keeps DTO validation close to the API boundary.

### Frontend

- React + Vite + TypeScript
- route-based module shell
- API-only data access, no direct database client in the browser

Why:

- preserves a fast SPA experience while moving trust boundaries into the backend
- cleanly separates presentation from business rules

## Layering

### Presentation

- HTTP routes in `apps/api/src/modules/*/*.routes.ts`
- React pages and components in `apps/web/src`

### Application

- module services orchestrate workflows and authorization

### Domain

- shared contracts in `packages/contracts`
- team, role, matter, quote, lead, and task definitions

### Infrastructure

- in-memory repository for the initial scaffold
- Prisma schema prepared for RDS migration
- Docker and AWS deployment guidance

## Security design

- bearer access tokens with short TTL
- refresh tokens stored as hashes and rotated
- role and team-based authorization gates on the server
- Zod validation for body, params, and query input
- Fastify Helmet, rate limiting, and strict CORS
- environment-only secret loading
- no hardcoded production credentials

## AWS deployment model

### Recommended baseline

- React web app on S3 + CloudFront
- Fastify API on ECS Fargate behind an Application Load Balancer
- PostgreSQL on RDS or Aurora PostgreSQL
- Secrets Manager for DB credentials and JWT secrets
- CloudWatch for logs and alarms
- WAF in front of CloudFront / ALB

### Why this model

- stateless API containers scale horizontally
- frontend hosting is cheap and globally cacheable
- RDS keeps relational reporting and transactional consistency
- the monorepo can later split domains into separate services without changing the frontend contract

## Migration strategy

1. Capture legacy workflows as shared contracts and server-owned APIs.
2. Rebuild the operational pipeline first: clients, quotes, leads, matters, tasks.
3. Normalize the data model around reusable entities and module-specific task definitions.
4. Replace the in-memory repository with Prisma repositories.
5. Import legacy data through one-time migration scripts after the target schema stabilizes.
