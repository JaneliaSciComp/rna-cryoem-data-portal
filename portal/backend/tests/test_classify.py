import pytest

from rna_portal.classify import classify
from rna_portal.models import Kind, Source


@pytest.mark.parametrize(
    "path,expected",
    [
        ("Mol9_gRNAde/PDB_deposit/10ZT.pdb", (Kind.MODEL, Source.DEPOSITED)),
        ("Mol23_TrpHolo/PDB_entry/D_1000307649_model-annotate_P1.pdb", (Kind.MODEL, Source.DEPOSITED)),
        ("Mol9_gRNAde/PDB_deposit/emd_75574.map", (Kind.MAP, Source.DEPOSITED)),
        ("Mol9_gRNAde/PDB_deposit/10zt_full_validation.pdf", (Kind.REPORT, Source.DEPOSITED)),
        ("Mol9_gRNAde/AlphaFold/fold_p20_grnade2_model_0.cif", (Kind.MODEL, Source.PREDICTED)),
        ("Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_009_volume_map.mrc", (Kind.MAP, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Maps/J300_fsc_iteration_009.png", (Kind.PLOT, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_json.log", (Kind.LOG, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Micrographs/J1_raw_data_001.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        ("Mol23_TrpHolo/CryoEM/Micrographs/J90_defocus_range.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        # Folder names and extensions are case-insensitive.
        ("Mol9_gRNAde/cryoem/micrographs/x.PNG", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        # A file in a folder the rules don't know is still cataloged, as "other".
        ("Mol9_gRNAde/Models/new_model.pdb", (Kind.MODEL, Source.OTHER)),
        ("Mol9_gRNAde/top_level_model.cif", (Kind.MODEL, Source.OTHER)),
        # The molecule folder's own name never hints a source.
        ("PDB_like_name/model.pdb", (Kind.MODEL, Source.OTHER)),
    ],
)
def test_classify(path, expected):
    assert classify(path) == expected


@pytest.mark.parametrize(
    "path",
    [
        "Mol9_gRNAde/AlphaFold/fold_p20_grnade2_full_data_0.json",
        "Mol9_gRNAde/AlphaFold/terms_of_use.md",
        "Mol23_TrpHolo/CryoEM/Micrographs/P106-J90-09_18_2026-10_21_01.csv",
        "README.pdf",  # in the data root, outside any molecule folder
        "Mol9_gRNAde/CryoEM/Maps/._J300_fsc.png",  # macOS metadata file
    ],
)
def test_not_cataloged(path):
    assert classify(path) is None
