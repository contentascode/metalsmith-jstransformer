var jstransformer = require('jstransformer')
var toTransformer = require('inputformat-to-jstransformer')
var extend = require('extend')
var async = require('async')
var clone = require('clone')
var match = require('minimatch').match

var transformers = {}

/**
* Get the transformer from the given name.
*
* @return The JSTransformer; null if it doesn't exist.
*/
function getTransformer (name) {
  if (name in transformers) {
    return transformers[name]
  }
  var transformer = toTransformer(name)
  transformers[name] = transformer ? jstransformer(transformer) : false
  return transformers[name]
}

module.exports = function (opts) {
  // Prepare the options.
  opts = opts || {}
  opts.pattern = opts.pattern || '!_**/*'

  // Execute the plugin.
  return function (files, metalsmith, done) {
    /**
     * Process the given file. Call done() when done processing.
     */
    function processFile (file, done) {
      /**
       * Process the given extension on the file.
       */
      function processExtension (extension, done) {
        // Retrieve the transformer.
        var transformer = getTransformer(extension)

        // Process the extension until the transformation is done.
        if (transformer && !files[file].jstransformer_done) {
          // Construct the options.
          var options = extend({}, metalsmith.metadata(), files[file], {
            filename: metalsmith.source() + '/' + file
          })

          // Get the transformer to render the contents.
          transformer.renderAsync(files[file].contents.toString(), options, options).then(function (result) {
            // Allow providing the default output format.
            files[file].jstransformer_outputFormat = transformer.outputFormat
            // Remove an extension from the end.
            files[file].jstransformer_filepath.pop()
            files[file].contents = new Buffer(result.body)
            done()
          }, function (err) {
            files[file].jstransformer_done = true
            done(err)
          })
        } else {
          // The transformer isn't supported, skip the rest.
          files[file].jstransformer_done = true
          done()
        }
      }

      // Prepare the extension processing.
      var extensions = file.split('.')
      files[file].jstransformer_filepath = clone(extensions)
      extensions.reverse().pop()
      // Loop through the transformer series.
      async.mapSeries(extensions, processExtension, done)
    }

    /**
     * Rename the given file to its desired new name.
     */
    function renameFile (file, done) {
      console.log(file)
      var filename = file
      // Check if there is a potential filepath change.
      if (files[file].jstransformer_filepath) {
        // See if we should add the default output format.
        if (files[file].jstransformer_filepath.length === 1 && files[file].jstransformer_outputFormat) {
          files[file].jstransformer_filepath.push(files[file].jstransformer_outputFormat)
        }
        filename = files[file].jstransformer_filepath.join('.')
      }

      // See if we are to now rename the file.
      if (filename !== file) {
        var newFile = clone(files[file])
        delete files[file]
        files[filename] = newFile
      }

      done()
    }

    // Filter out all the files we are to ignore.
    var results = match(Object.keys(files), opts.pattern)

    // Process each file.
    async.map(results, processFile, function (err) {
      if (err) {
        done(err)
      } else {
        // Now rename all the files.
        async.map(results, renameFile, done)
      }
    })
  }
}
