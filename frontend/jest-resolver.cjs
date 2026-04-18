// Custom resolver that forces all .js/.jsx files to be treated as CJS
// This works around "type": "module" in package.json causing Jest to
// try loading .js files as native ESM instead of letting babel-jest transform them.
module.exports = (path, options) => {
  return options.defaultResolver(path, {
    ...options,
    packageFilter: (pkg) => {
      if (pkg.type === 'module') {
        delete pkg.type;
      }
      return pkg;
    },
  });
};
