from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_email_case_insensitive_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="preferred_language",
            field=models.CharField(
                choices=[("en", "English"), ("fa", "Persian")],
                default="en",
                max_length=2,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="preferred_theme",
            field=models.CharField(
                choices=[("light", "Light"), ("dark", "Dark")],
                default="light",
                max_length=8,
            ),
        ),
    ]
