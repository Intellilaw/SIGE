# Intranet Analysis

## Reference architecture

`Intranet` is a React + Vite monolith that performs most business operations directly from the browser through Supabase client calls. The application mixes routing, authorization, data access, and business workflow logic in page components and configuration files.

## Main functional areas discovered

### Operational intake

- clients catalog (`clients`)
- quote types and quotes (`quote_types`, `quotes`)
- lead tracking (`leads_tracking`)
- active matters (`active_matters`)

### Execution modules

- litigation
- corporate and labor
- settlements / convenios
- financial law
- tax compliance

These modules share a repeated pattern:

- matter is assigned to a team
- work is distributed into practice-specific tracking tables
- each tracking table has workflow or status states
- terms and due dates are tracked separately
- some modules support recurring terms and monthly follow-up views

### Supporting modules

- general finance and snapshots
- general expenses
- commissions
- KPI dashboards and document submission tracking
- admin user management
- calculators for labor settlements and payroll
- third-party document library

## Core workflows inferred

### Quote to lead

Quotes can be created, edited, templated, and pushed into lead tracking. Quote updates try to synchronize lead and matter records in place.

### Lead to matter

Leads advance into active matters, carrying client, quote number, total amount, and subject data.

### Matter to execution

Active matters are assigned to execution teams. Once linked, they surface in litigation, corporate, settlements, financial, or compliance views.

### Task distribution

Each practice area manages tasks through dedicated tables. Examples:

- `convenios_contratos_no_mediacion`
- `convenios_mediacion`
- `fin_reportes_ifit`
- `comp_pre_declaraciones_enviadas`

### Terms and recurring rules

Financial and compliance modules compute due dates using business-day rules such as:

- fixed day of month
- last business day of month
- quarterly due dates
- yearly last business day of a month
- four-month cycles

## Data model themes

The legacy schema is table-heavy and denormalized. Key entities include:

- users and metadata stored in Supabase Auth
- clients
- quotes and quote templates
- leads
- active matters and practice-specific matters
- tracking records
- terms
- additional tasks
- history / distributor events
- finance, expenses, commissions
- holidays

## Security and scalability gaps in Intranet

- direct browser writes to the database
- client-side role enforcement for sensitive operations
- permissive RLS policies (`using (true)`) in many tables
- credentials and user creation flows handled from the frontend
- duplicated business logic across many pages
- limited auditability and weak separation of concerns
- difficult horizontal scaling because the SPA owns too much workflow logic

## Migration priorities for SIGE_2

### Phase 1

- authentication, authorization, user context
- clients, quotes, leads, matters
- task-module catalog and task tracking API

### Phase 2

- recurring term generation
- finance, expenses, commissions
- KPI dashboards and audits
- document library and object storage

### Phase 3

- calculators and specialist modules
- background jobs and notifications
- full persistence migration with data import tooling
