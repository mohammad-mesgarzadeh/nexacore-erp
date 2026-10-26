from django.db import migrations, models


def promote_users_to_admin(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.exclude(role="admin").update(role="admin")


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_user_preferences"),
    ]

    operations = [
        migrations.RunPython(promote_users_to_admin, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("admin", "Admin"), ("manager", "Manager"), ("staff", "Staff")],
                default="admin",
                max_length=16,
            ),
        ),
    ]
