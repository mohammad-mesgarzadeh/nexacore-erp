from rest_framework.exceptions import ValidationError
from rest_framework.fields import DateField


def filter_date_range(queryset, params, field_name, *, datetime_field=False):
    try:
        start = DateField().run_validation(params.get("from")) if params.get("from") else None
        end = DateField().run_validation(params.get("to")) if params.get("to") else None
    except ValidationError:
        raise ValidationError({"date": "Use ISO dates in YYYY-MM-DD format."})
    if start and end and start > end:
        raise ValidationError({"to": "End date must be on or after the start date."})
    lookup = f"{field_name}__date" if datetime_field else field_name
    if start:
        queryset = queryset.filter(**{f"{lookup}__gte": start})
    if end:
        queryset = queryset.filter(**{f"{lookup}__lte": end})
    return queryset
