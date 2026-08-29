import { regex } from "zod/v4/mini";

const bookmarkchecker = function (bookmark: { URL: string; title: string }) {
  try {
    if (typeof bookmark !== "object" || bookmark === null) {
      throw new Error("Bookmark must be a non-null object");
    }
    const regex =
      /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/;
    if (!regex.test(bookmark.URL)) {
      throw new Error("Invalid URL format");
    }
    if (typeof bookmark.title !== "string" || bookmark.title.trim() === "") {
      throw new Error("Title must be a non-empty string");
    }
    console.log("Bookmark is valid:", bookmark);
    return true;
  } catch (error) {
    console.error("Error checking bookmark:", error);
    return false;
  }
};

export { bookmarkchecker };
