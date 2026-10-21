"""add the particle count

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # parsers.PARSER_VERSION went up with this column, so the next scan fills it in.
    op.add_column("molecule", sa.Column("particle_count", sa.Integer))


def downgrade() -> None:
    op.drop_column("molecule", "particle_count")
