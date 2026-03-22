using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CleanupLegacyPrivacyColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PrivacyTier",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PrivacyTier",
                table: "CustomFieldValues");

            migrationBuilder.DropColumn(
                name: "Permission",
                table: "AccessTokens");

            migrationBuilder.AlterColumn<Guid>(
                name: "BucketId",
                table: "Members",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BucketId",
                table: "CustomFieldValues",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldValues_BucketId",
                table: "CustomFieldValues",
                column: "BucketId");

            migrationBuilder.AddForeignKey(
                name: "FK_CustomFieldValues_PrivacyBuckets_BucketId",
                table: "CustomFieldValues",
                column: "BucketId",
                principalTable: "PrivacyBuckets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomFieldValues_PrivacyBuckets_BucketId",
                table: "CustomFieldValues");

            migrationBuilder.DropIndex(
                name: "IX_CustomFieldValues_BucketId",
                table: "CustomFieldValues");

            migrationBuilder.DropColumn(
                name: "BucketId",
                table: "CustomFieldValues");

            migrationBuilder.AlterColumn<Guid>(
                name: "BucketId",
                table: "Members",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<int>(
                name: "PrivacyTier",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PrivacyTier",
                table: "CustomFieldValues",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Permission",
                table: "AccessTokens",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }
    }
}
