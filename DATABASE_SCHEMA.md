# Esquema de la base de datos

Postgres en Supabase. **Todas las tablas tienen RLS**: cada usuario solo ve sus filas (`user_id = auth.uid()`). Las migraciones están en `supabase/migrations/` y se aplican solas al desplegar (`supabase db push`). Nunca se edita una migración ya aplicada: los cambios van en una nueva.

Principios:
- **Planificado ≠ realizado**: `planned_sessions` / `planned_meals` frente a `sessions` / `food_logs`.
- **Origen de cada dato**: `sessions.primary_source` (healthkit = Apple Watch vía Intervals.icu, manual, photo), `session_sets.origin` (manual, text, ai), `body_metrics.source`, confianza de gramos en comidas.
- **Trazabilidad**: `plan_changes` (cada cambio del plan con su motivo, antes y después), `session_edits` (historial de ediciones de un entreno), `coach_messages.content.tools` (herramientas que usó la IA), `pantry_deduction` en comidas y batch (qué se descontó de la despensa).

Resumen de tablas y columnas principales (el detalle exacto, en las migraciones).

## Perfil y objetivos

- **profiles** (0001): `id`, `display_name`, `birth_date`, `sex`, `height_cm`, `experience`, `sports_preferences`, `hyrox_division`, `allow_doubles`, `crossfit_per_week`, `sleep_need_h`, `locale`, `created_at`, `updated_at`
- **body_metrics** (0001): `id`, `user_id`, `date`, `weight_kg`, `body_fat_pct`, `lean_mass_kg`, `source`, `waist_cm`
- **physiology** (0001): `id`, `user_id`, `effective_from`, `hr_rest`, `vo2max`, `method`
- **availability** (0001): `user_id`, `weekday`, `am`, `pm`, `max_minutes`, `box_class`, `preferred_time`
- **injuries** (0001): `id`, `user_id`, `area`, `description`, `started_on`, `resolved_on`, `avoid_regions`, `notes`, `created_at`
- **goals** (0001): `id`, `user_id`, `name`, `type`, `date`, `priority`, `distance_m`, `target_time_s`, `notes`, `status`, `result_time_s`, `created_at`, `updated_at`
- **phases** (0001): `id`, `user_id`, `goal_id`, `kind`, `start_date`, `end_date`, `focus`, `secondary`, `generated_at`
- **consents** (0001): `user_id`, `kind`, `version`, `granted_at`, `revoked_at`, `provider`
- **coach_memory** (0001): `id`, `user_id`, `fact`, `category`, `source_message_id`, `active`, `created_at`

## Plan

- **planned_sessions** (0001): `id`, `user_id`, `engine_key`, `week_start`, `date`, `slot`, `type`, `discipline`, `title`, `objective`, `intensity`, `est_minutes`, `leg_stress`, `key`, `planned_km`, `steps`, `rationale`, `status`, `completed_session_id`, `locked`, `updated_at`, `start_local`, `from_calendar`, `done_manually`, `reserved`
- **plan_changes** (0001): `id`, `user_id`, `planned_session_id`, `date`, `trigger`, `action`, `reason`, `data`, `before`, `created_at`
- **calendar_settings** (0003): `user_id`, `ics_urls`, `device_calendars`, `crossfit_keywords`, `crossfit_calendars`, `export_plan`, `last_hash`, `updated_at`
- **calendar_events** (0003): `user_id`, `uid`, `title`, `start_at`, `end_at`, `all_day`, `calendar`, `kind`, `source`, `synced_at`

## Entrenos (lo realizado)

- **sessions** (0001): `id`, `user_id`, `started_at`, `duration_s`, `discipline`, `title`, `rpe`, `avg_hr`, `hr_zone_s`, `distance_m`, `elevation_gain_m`, `cadence_spm`, `avg_stride_m`, `active_kcal`, `is_race`, `is_time_trial`, `notes`, `primary_source`, `internal_load`, `leg_index`, `created_at`, `updated_at`, `deleted_at`
- **session_sources** (0001): `id`, `user_id`, `session_id`, `source`, `external_id`, `imported_at`
- **session_blocks** (0001): `id`, `user_id`, `session_id`, `position`, `kind`, `format`, `title`, `time_cap_s`, `result_text`, `notes`
- **session_sets** (0001): `id`, `user_id`, `session_id`, `block_id`, `position`, `exercise_id`, `custom_exercise_id`, `reps`, `rpe`, `is_warmup`, `performed_on`
- **run_splits** (0001): `session_id`, `user_id`, `km_index`, `duration_s`, `avg_hr`
- **session_laps** (0008): `session_id`, `user_id`, `idx`, `kind`, `start_s`, `distance_m`, `elev_gain_m`
- **session_streams** (0008): `session_id`, `user_id`, `series`, `route`, `zones`, `updated_at`
- **personal_records** (0001): `id`, `user_id`, `metric`, `value`, `unit`, `kind`, `achieved_on`, `session_id`, `detail`
- **exercises** (0001): `id`, `name`, `category`, `unit`, `aliases`, `pr_tracked`
- **user_exercises** (0001): `id`, `user_id`, `name`, `maps_to`, `category`
- **workout_drafts** (0007): `id`, `user_id`, `payload`, `updated_at`
- **session_edits** (0007): `id`, `user_id`, `session_id`, `edited_at`, `actor`, `field`, `old_value`, `new_value`
- **photo_imports** (0001): `id`, `user_id`, `storage_path`, `status`, `parsed`, `session_id`, `model`, `created_at`, `updated_at`

## Salud y recuperación

- **daily_health** (0001): `user_id`, `date`, `hrv_ms`, `rhr`, `sleep_h`, `steps`, `vo2max`, `source`, `updated_at`, `avg_sleeping_hr`
- **checkins** (0001): `user_id`, `date`, `fatigue`, `soreness`, `stress`, `motivation`, `sleep_quality`, `pains`, `note`, `created_at`
- **readiness_daily** (0001): `user_id`, `date`, `score`, `reasons`, `acwr`, `computed_at`

## Nutrición

- **nutrition_settings** (0003): `user_id`, `mode`, `rate_kg_per_week`, `protein_g_per_kg`, `fat_g_per_kg`, `activity_factor`, `meal_slots`, `batch_day`, `dislikes`, `intolerances`, `max_supplements_per_day`, `notify`, `updated_at`, `compensate`, `shopping_day`
- **nutrition_goal_history** (0003): `id`, `user_id`, `mode`, `from_date`, `note`
- **foods** (0003): `id`, `owner`, `name`, `kcal`, `fiber`, `unit_grams`, `source`, `source_ref`, `search_terms`, `created_at`
- **recipes** (0003): `id`, `user_id`, `name`, `ingredients`, `steps`, `fridge_days`, `freezable`, `tags`, `favorite`, `source`, `created_at`
- **planned_meals** (0003): `id`, `user_id`, `date`, `slot`, `recipe_id`, `title`, `ingredients`, `status`, `locked`, `from_batch`, `updated_at`, `eaten_fraction`, `pantry_deduction`
- **food_logs** (0003): `id`, `user_id`, `date`, `slot`, `eaten_at`, `items`, `kcal`, `fiber`, `source`, `photo_path`, `planned_meal_id`, `created_at`
- **day_targets** (0003): `user_id`, `date`, `kcal`, `load`, `explanation`, `computed_at`
- **nutrition_alerts** (0003): `id`, `user_id`, `date`, `slot`, `level`, `message`, `read`, `created_at`, `pushed_at`
- **supplements** (0003): `id`, `user_id`, `kind`, `name`, `dose_text`, `stock`, `active`, `buy_url`, `low_pushed_on`
- **supplement_logs** (0003): `user_id`, `date`, `supplement_id`, `taken`

## Cocina

- **pantry_items** (0003): `id`, `user_id`, `name`, `food_id`, `location`, `quantity_g`, `expires_on`, `updated_at`, `pack_units`, `expiry_pushed_on`
- **batch_plans** (0003): `id`, `user_id`, `week_start`, `cook_date`, `plan`, `shopping`, `created_at`
- **shopping_lists** (0005): `user_id`, `week_start`, `shopping_date`, `items`, `covered`, `checked`, `updated_at`

## Coach e informes

- **coach_threads** (0001): `id`, `user_id`, `title`, `created_at`
- **coach_messages** (0001): `id`, `user_id`, `thread_id`, `role`, `content`, `created_at`
- **weekly_reports** (0015): `user_id`, `week_start`, `summary`, `text`, `created_at`, `seen_at`

## Integraciones

- **intervals_connections** (0008): `user_id`, `athlete_id`, `api_key`, `connected_at`, `history_from`, `last_pull_at`, `last_error`
- **intervals_inbox** (0008): `id`, `user_id`, `kind`, `external_id`, `payload`, `received_at`, `processed_at`, `result`
- **ingest_tokens** (0006): `user_id`, `token_hash`, `created_at`, `last_used_at`
- **health_inbox** (0006): `id`, `user_id`, `payload`, `received_at`, `processed_at`, `result`
- **push_subscriptions** (0006): `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`
- **strava_connections** (0001): `user_id`, `athlete_id`, `scopes`, `connected_at`
- **strava_tokens** (0001): `user_id`, `access_token`, `refresh_token`, `expires_at`
- **strava_cache** (0001): `user_id`, `activity_id`, `payload`, `fetched_at`

