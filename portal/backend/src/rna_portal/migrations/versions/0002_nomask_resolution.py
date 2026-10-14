"""add the no-mask resolution and the parser version stamp

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
    # 0 is older than any parsers.PARSER_VERSION, so the next scan re-reads every molecule.
    op.add_column("molecule", sa.Column("parsed_version", sa.Integer, nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("molecule", "parsed_version")
    op.drop_column("molecule", "nomask_resolution_a")
