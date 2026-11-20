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
        ("Mol9_gRNAde/Predicted_Models/fold_p20_grnade2_model_0.cif", (Kind.MODEL, Source.PREDICTED)),
        ("Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_009_volume_map.mrc", (Kind.MAP, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Maps/J300_fsc_iteration_009.png", (Kind.PLOT, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Maps/cryosparc_P93_J300_json.log", (Kind.LOG, Source.EXPERIMENTAL)),
        ("Mol105/CryoEM/Maps/cryosparc_P58_J291.json", (Kind.LOG, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/Micrographs/J1_raw_data_001.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        ("Mol23_TrpHolo/CryoEM/Micrographs/J90_defocus_range.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/Sequence/mol9_oi.fasta", (Kind.SEQUENCE, Source.OTHER)),
        ("Mol9_gRNAde/Sequence/mol9.fa", (Kind.SEQUENCE, Source.OTHER)),
        # Pooled into CryoEM/: the file name decides. Plots carry an iteration number.
        ("Mol9_gRNAde/CryoEM/J300_fsc_iteration_009.png", (Kind.PLOT, Source.EXPERIMENTAL)),
        (
            "Mol9_gRNAde/CryoEM/J300_fsc_iteration_009_after_fsc_mask_auto_tightening.png",
            (Kind.PLOT, Source.EXPERIMENTAL),
        ),
        ("Mol9_gRNAde/CryoEM/J300_per_particle_scale_factors_009.png", (Kind.PLOT, Source.EXPERIMENTAL)),
        ("Mol30_HisHolo/CryoEM/J12_input_mask_real_space_slices.png", (Kind.PLOT, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/J90_defocus_range.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        ("Mol9_gRNAde/CryoEM/J29_denoised_output_micrograph1.png", (Kind.MICROGRAPH, Source.EXPERIMENTAL)),
        (
            "Mol24_tC19zApo/CryoEM/J10_raw_data_j10imported011206002498941007152_mol24_b1g4_100_002_jan05_165918_x0y0_1eer.png",
            (Kind.MICROGRAPH, Source.EXPERIMENTAL),
        ),
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
        "Mol9_gRNAde/Predicted_Models/fold_p20_grnade2_full_data_0.json",
        "Mol9_gRNAde/Predicted_Models/terms_of_use.md",
        "Mol23_TrpHolo/CryoEM/Micrographs/P106-J90-09_18_2026-10_21_01.csv",
        "README.pdf",  # in the data root, outside any molecule folder
        "Mol9_gRNAde/CryoEM/Maps/._J300_fsc.png",  # macOS metadata file
    ],
)
def test_not_cataloged(path):
    assert classify(path) is None
