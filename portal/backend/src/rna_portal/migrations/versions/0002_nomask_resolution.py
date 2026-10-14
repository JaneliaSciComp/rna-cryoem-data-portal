"""add the no-mask resolution

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("molecule", sa.Column("nomask_resolution_a", sa.Float))


def downgrade() -> None:
    op.drop_column("molecule", "nomask_resolution_a")
