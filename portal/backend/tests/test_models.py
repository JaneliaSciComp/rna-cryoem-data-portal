from datetime import datetime, timezone

from sqlalchemy import delete, inspect, select, text
from sqlalchemy.orm import Session

from rna_portal import db
from rna_portal.models import Molecule, MoleculeFile

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def test_migration_creates_tables(engine):
    assert {"molecule", "molecule_file", "portal_alembic_version"} <= set(
        inspect(engine).get_table_names()
    )


def test_deleting_a_molecule_deletes_its_files(engine):
    with Session(engine) as s:
        s.add(
            Molecule(
                id="Mol9_gRNAde",
                name="gRNAde",
                scanned_at=NOW,
                files=[
                    MoleculeFile(
                        path="Mol9_gRNAde/PDB_deposit/10ZT.pdb",
                        kind="model",
                        source="deposited",
                        size=1,
                        mtime=NOW,
                    )
                ],
            )
        )
        s.commit()
        # A SQL-level delete, as the scanner does: exercises ON DELETE CASCADE, not the ORM.
        s.execute(delete(Molecule).where(Molecule.id == "Mol9_gRNAde"))
        s.commit()
        assert s.scalars(select(MoleculeFile)).all() == []


def test_migrate_ignores_another_apps_alembic_history(engine):
    # The dev database was ai-cryoet's first; its revisions live in public.alembic_version.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)"))
        conn.execute(text("INSERT INTO alembic_version VALUES ('b8c9d0e1f2a3')"))
    db.migrate()
    assert {"molecule", "molecule_file"} <= set(inspect(engine).get_table_names())
