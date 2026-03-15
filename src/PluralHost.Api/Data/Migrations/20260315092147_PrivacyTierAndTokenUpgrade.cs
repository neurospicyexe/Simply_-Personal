using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PluralHost.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PrivacyTierAndTokenUpgrade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add PrivacyTier (default 0 = Public)
            migrationBuilder.AddColumn<int>(
                name: "PrivacyTier",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // 2. Data migration: IsPrivate=1 → PrivacyTier=3 (Private)
            migrationBuilder.Sql(
                "UPDATE Members SET PrivacyTier = 3 WHERE IsPrivate = 1;");

            // 3. Drop IsPrivate
            migrationBuilder.DropColumn(
                name: "IsPrivate",
                table: "Members");

            // 4. Add Member.AllowsBoardPosting (default true = 1)
            migrationBuilder.AddColumn<bool>(
                name: "AllowsBoardPosting",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            // 5. Swap TokenPermission integer values BEFORE any rename:
            //    ReadOnly(0) → Public(1), ReadFrontOnly(1) → ReadFrontOnly(0)
            migrationBuilder.Sql(@"
        UPDATE AccessTokens SET Permission = CASE
            WHEN Permission = 0 THEN 1
            WHEN Permission = 1 THEN 0
            ELSE Permission
        END;");

            // 6. Add AccessToken.AllowsBoardPosting (default false = 0)
            migrationBuilder.AddColumn<bool>(
                name: "AllowsBoardPosting",
                table: "AccessTokens",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // 7. Add BoardMessage.TokenId (nullable FK)
            migrationBuilder.AddColumn<string>(
                name: "TokenId",
                table: "BoardMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BoardMessages_TokenId",
                table: "BoardMessages",
                column: "TokenId");

            migrationBuilder.AddForeignKey(
                name: "FK_BoardMessages_AccessTokens_TokenId",
                table: "BoardMessages",
                column: "TokenId",
                principalTable: "AccessTokens",
                principalColumn: "TokenValue");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BoardMessages_AccessTokens_TokenId",
                table: "BoardMessages");

            migrationBuilder.DropIndex(
                name: "IX_BoardMessages_TokenId",
                table: "BoardMessages");

            migrationBuilder.DropColumn(name: "TokenId", table: "BoardMessages");
            migrationBuilder.DropColumn(name: "AllowsBoardPosting", table: "AccessTokens");
            migrationBuilder.DropColumn(name: "AllowsBoardPosting", table: "Members");

            // Reverse the TokenPermission swap
            migrationBuilder.Sql(@"
        UPDATE AccessTokens SET Permission = CASE
            WHEN Permission = 1 THEN 0
            WHEN Permission = 0 THEN 1
            ELSE Permission
        END;");

            migrationBuilder.AddColumn<bool>(
                name: "IsPrivate",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql(
                "UPDATE Members SET IsPrivate = 1 WHERE PrivacyTier = 3;");

            migrationBuilder.DropColumn(name: "PrivacyTier", table: "Members");
        }
    }
}
