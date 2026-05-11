# Generated migration for advanced firewall fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('firewall', '0004_risk_score_fields'),
    ]

    operations = [
        # Add semantic analysis fields to PromptLog
        migrations.AddField(
            model_name='promptlog',
            name='semantic_flags',
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name='promptlog',
            name='semantic_confidence',
            field=models.FloatField(default=0.0),
        ),
        migrations.AddField(
            model_name='promptlog',
            name='attack_vectors',
            field=models.JSONField(default=list, blank=True),
        ),
        # Add provenance fields to PromptLog
        migrations.AddField(
            model_name='promptlog',
            name='trust_score',
            field=models.FloatField(default=1.0),
        ),
        migrations.AddField(
            model_name='promptlog',
            name='trust_level',
            field=models.CharField(max_length=20, default='TRUSTED'),
        ),
        migrations.AddField(
            model_name='promptlog',
            name='source_type',
            field=models.CharField(max_length=20, default='TEXT'),
        ),
        migrations.AddField(
            model_name='promptlog',
            name='anomaly_flags',
            field=models.JSONField(default=list, blank=True),
        ),
    ]
