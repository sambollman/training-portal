// Initial schema for the training portal, translated from the original
// Postgres schema.sql into Knex's schema builder so it runs correctly
// against Microsoft SQL Server.
//
// This runs automatically on every app startup via db.migrate.latest()
// (see server/index.js). Knex tracks which migrations have already run in
// a knex_migrations table, so on a fresh SQL Server instance this builds
// the whole schema from nothing; on a server that already has it, this
// file is skipped and nothing is re-run. Future schema changes should be
// added as new migration files rather than editing this one, so that
// "maintaining" the schema over time stays automatic for IT.

exports.up = async function (knex) {
  // --- Users (populated on first login, no separate signup flow) ---
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.string('username').notNullable().unique();
    table.string('full_name');
    table.string('first_name');
    table.string('last_name');
    table.string('email');
    table.string('badge_number');
    table.string('post_license_number');
    table.string('unit');
    table.string('rank');
    table.string('role').notNullable().defaultTo('officer');
    table.uuid('supervisor_id').references('id').inTable('users');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Trainings ---
  await knex.schema.createTable('trainings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.string('title').notNullable();
    table.string('category');
    table.text('description');
    table.string('instructor');
    table.string('location');
    table.boolean('is_out_of_state').defaultTo(false);
    table.date('session_date');
    table.date('end_date');
    table.time('start_time');
    table.time('end_time');
    table.decimal('duration_hours', 8, 2);
    table.integer('seat_capacity');
    table.boolean('no_seat_limit').defaultTo(false);
    table.decimal('cost', 10, 2);
    table.string('training_type').defaultTo('internal');
    table.boolean('is_required').defaultTo(false);
    table.boolean('is_archived').defaultTo(false);
    table.boolean('is_closed').defaultTo(false);
    table.string('section_number');
    table.string('compliance_tag');
    table.uuid('instructor_id').references('id').inTable('users');
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Training instructors (many-to-many) ---
  await knex.schema.createTable('training_instructors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('training_id').notNullable().references('id').inTable('trainings').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.unique(['training_id', 'user_id']);
  });

  // --- Enrollment requests ---
  await knex.schema.createTable('enrollment_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('training_id').notNullable().references('id').inTable('trainings');
    table.uuid('officer_id').notNullable().references('id').inTable('users');
    table.uuid('supervisor_id').references('id').inTable('users');
    table.string('request_type').notNullable().defaultTo('self_requested');
    table.string('status').notNullable().defaultTo('pending');
    table.text('reason');
    table.text('officer_response');
    table.decimal('training_cost', 10, 2);
    table.decimal('travel_cost', 10, 2);
    table.decimal('hotel_cost', 10, 2);
    table.decimal('per_diem', 10, 2);
    table.string('chain_status').defaultTo('pending');
    table.text('denial_note');
    table.boolean('attended');
    table.boolean('reminder_sent').defaultTo(false);
    table.timestamp('acted_on_at', { useTz: false });
    table.uuid('acted_on_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.unique(['training_id', 'officer_id']);
  });

  // --- External training requests (self-reported, not from portal listings) ---
  await knex.schema.createTable('external_training_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('officer_id').notNullable().references('id').inTable('users');
    table.string('training_name').notNullable();
    table.string('organization');
    table.string('location');
    table.boolean('is_out_of_state').defaultTo(false);
    table.date('start_date');
    table.date('end_date');
    table.decimal('duration_hours', 8, 2);
    table.text('description');
    table.decimal('training_cost', 10, 2);
    table.decimal('travel_cost', 10, 2);
    table.decimal('hotel_cost', 10, 2);
    table.decimal('per_diem', 10, 2);
    table.string('website');
    table.text('reason');
    table.text('officer_response');
    table.string('status').defaultTo('pending');
    table.string('chain_status').defaultTo('pending');
    table.boolean('attended');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Approval chain steps ---
  await knex.schema.createTable('approval_steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('enrollment_request_id').references('id').inTable('enrollment_requests').onDelete('CASCADE');
    table.uuid('external_request_id').references('id').inTable('external_training_requests').onDelete('CASCADE');
    table.integer('step_number').notNullable();
    table.uuid('approver_id').notNullable().references('id').inTable('users');
    table.string('approver_name');
    table.string('approver_rank');
    table.string('decision');
    table.text('comment');
    table.uuid('next_approver_id').references('id').inTable('users');
    table.timestamp('decided_at', { useTz: false });
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Training file attachments ---
  await knex.schema.createTable('training_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('training_id').notNullable().references('id').inTable('trainings').onDelete('CASCADE');
    table.string('filename').notNullable();
    table.string('original_name').notNullable();
    table.string('mimetype');
    table.integer('size');
    table.uuid('uploaded_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.string('file_type').defaultTo('attachment');
  });

  // --- Training records (transcript) ---
  await knex.schema.createTable('training_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('officer_id').notNullable().references('id').inTable('users');
    table.string('training_title').notNullable();
    table.date('training_date');
    table.date('completion_date');
    table.decimal('hours', 8, 2);
    table.string('status').defaultTo('completed');
    table.boolean('certified').defaultTo(false);
    table.string('certification_name');
    table.date('certification_expiration');
    table.string('training_type').defaultTo('internal');
    table.date('end_date');
    table.string('location');
    table.decimal('cost', 10, 2);
    table.string('instructor');
    table.decimal('certification_hours', 8, 2);
    table.string('score');
    table.text('remarks');
    table.string('source').defaultTo('portal');
    table.uuid('enrollment_request_id').references('id').inTable('enrollment_requests');
    table.uuid('external_request_id').references('id').inTable('external_training_requests');
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Training certificates (attached to records) ---
  await knex.schema.createTable('training_certificates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('training_record_id').notNullable().references('id').inTable('training_records').onDelete('CASCADE');
    table.string('filename').notNullable();
    table.string('original_name').notNullable();
    table.string('mimetype');
    table.integer('size');
    table.uuid('uploaded_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Specialized unit trainings (calendar-only, not in request workflow) ---
  await knex.schema.createTable('specialized_trainings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.string('title').notNullable();
    table.string('unit_type');
    table.timestamp('start_datetime', { useTz: false });
    table.timestamp('end_datetime', { useTz: false });
    table.text('description');
    table.string('location');
    table.boolean('is_recurring').defaultTo(false);
    table.string('recurrence_pattern');
    table.date('recurrence_end_date');
    table.uuid('parent_recurring_id').references('id').inTable('specialized_trainings');
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Specialized training file attachments ---
  await knex.schema.createTable('specialized_training_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('NEWID()'));
    table.uuid('specialized_training_id').notNullable().references('id').inTable('specialized_trainings').onDelete('CASCADE');
    table.string('filename').notNullable();
    table.string('original_name').notNullable();
    table.string('mimetype');
    table.integer('size');
    table.uuid('uploaded_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  // --- Auto-update updated_at on row changes ---
  // SQL Server doesn't support Postgres-style BEFORE UPDATE trigger
  // functions, so this uses a plain T-SQL AFTER UPDATE trigger per table
  // instead. CREATE OR ALTER makes each one safe to re-run.
  const updatedAtTables = ['users', 'trainings', 'enrollment_requests'];
  for (const tableName of updatedAtTables) {
    await knex.raw(`
      CREATE OR ALTER TRIGGER trg_${tableName}_updated_at
      ON ${tableName}
      AFTER UPDATE
      AS
      BEGIN
        SET NOCOUNT ON;
        UPDATE t
        SET updated_at = SYSUTCDATETIME()
        FROM ${tableName} t
        INNER JOIN inserted i ON t.id = i.id;
      END
    `);
  }
};

exports.down = async function (knex) {
  // Drop in reverse dependency order. This is here for completeness /
  // local experimentation — it isn't called anywhere in normal operation.
  await knex.raw('DROP TRIGGER IF EXISTS trg_enrollment_requests_updated_at');
  await knex.raw('DROP TRIGGER IF EXISTS trg_trainings_updated_at');
  await knex.raw('DROP TRIGGER IF EXISTS trg_users_updated_at');
  await knex.schema.dropTableIfExists('specialized_training_files');
  await knex.schema.dropTableIfExists('specialized_trainings');
  await knex.schema.dropTableIfExists('training_certificates');
  await knex.schema.dropTableIfExists('training_records');
  await knex.schema.dropTableIfExists('training_files');
  await knex.schema.dropTableIfExists('approval_steps');
  await knex.schema.dropTableIfExists('external_training_requests');
  await knex.schema.dropTableIfExists('enrollment_requests');
  await knex.schema.dropTableIfExists('training_instructors');
  await knex.schema.dropTableIfExists('trainings');
  await knex.schema.dropTableIfExists('users');
};
