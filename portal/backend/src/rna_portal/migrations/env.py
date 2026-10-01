"""Alembic environment: migrates the database at CATALOG_DB_URL."""
from alembic import context
from sqlalchemy import create_engine

from rna_portal import config
from rna_portal.models import Base

with create_engine(config.db_url()).connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
