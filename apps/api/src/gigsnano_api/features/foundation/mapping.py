from gigsnano_api.features.foundation.types import Foundation
from gigsnano_api.models.foundation import ProjectFoundation


def foundation_from_row(row: ProjectFoundation) -> Foundation:
    return Foundation(
        allowed_libraries=tuple(row.allowed_libraries),
        enforce_design_tokens=row.enforce_design_tokens,
        quality_gates=tuple(row.quality_gates),
    )
