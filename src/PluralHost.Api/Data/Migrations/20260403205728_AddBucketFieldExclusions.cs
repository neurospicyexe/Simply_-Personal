using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBucketFieldExclusions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BucketFieldExclusions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BucketId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BucketFieldExclusions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BucketFieldExclusions_CustomFields_FieldId",
                        column: x => x.FieldId,
                        principalTable: "CustomFields",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BucketFieldExclusions_PrivacyBuckets_BucketId",
                        column: x => x.BucketId,
                        principalTable: "PrivacyBuckets",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_BucketFieldExclusions_BucketId_FieldId",
                table: "BucketFieldExclusions",
                columns: new[] { "BucketId", "FieldId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BucketFieldExclusions_FieldId",
                table: "BucketFieldExclusions",
                column: "FieldId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BucketFieldExclusions");
        }
    }
}
